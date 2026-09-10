import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  adjustAdminModerationCaseScore,
  getAdminModerationCase,
  getAdminModerationChatThread,
  getAdminSubjectModerationHistory,
  resolveAdminModerationCase,
  searchAdminModerationCases,
} from "@/app/actions/admin-moderation";
import {
  acknowledgeReportOutcomes,
  getUnacknowledgedReportOutcomes,
  submitUserReport,
} from "@/app/actions/reports";
import { sendMessage } from "@/app/actions/chat";
import { mapResolutionOptionToInput } from "@/lib/moderation/resolution-config";
import {
  clearSessionCache,
  getAdminUserId,
  getBuyerUserId,
  runAsAdmin,
  runAsBuyer,
  runAsSeller,
  warmSession,
  getSellerClient,
} from "../shared/auth-context";
import { createServiceRoleClient } from "../shared/supabase-admin";
import { wipeModerationMatrixPair } from "./helpers/cleanup";
import {
  countModerationAuditLogsForCase,
  countPendingReports,
  getAccountAccessRestriction,
  getActiveAccountSanctionsForUser,
  getLatestReport,
  getListingStatus,
  getMemberOrderPayoutStatus,
  getModerationCaseResolution,
  getModerationCaseScores,
  getModerationCaseStatus,
  getOutcomeAckState,
  getResolveAuditPayload,
  insertLegacyResolvedReportFixture,
} from "./helpers/db-assert";
import {
  getSellerId,
  hasFullModerationIntegrationEnv,
} from "./helpers/env";
import {
  expireAccountAccessSanctionsForUser,
  expireSanctionForCase,
  seedInsufficientEvidenceCase,
  seedMatrixMemberListingForSeller,
  seedMemberOrderWithPayoutReady,
} from "./helpers/sanction-fixtures";
import {
  buildChatReportInput,
  buildProfileReportInput,
  ensureDbChatRoom,
  insertChatMessageProbe,
  MATRIX_PREFIX,
  uniqueDetails,
} from "./helpers/fixtures";

describe.skipIf(!hasFullModerationIntegrationEnv()).sequential(
  "Moderation integration matrix",
  () => {
    const runId = String(Date.now());
    const sellerId = () => getSellerId();
    const buyerId = () => getBuyerUserId();
    let buyerSellerChatRoomId = "";

    beforeAll(async () => {
      await warmSession("admin");
      await warmSession("buyer");
      await warmSession("seller");
      buyerSellerChatRoomId = await ensureDbChatRoom(buyerId(), sellerId());
    });

    beforeEach(async () => {
      await wipeModerationMatrixPair({
        reporterId: buyerId(),
        subjectId: sellerId(),
        chatRoomId: buyerSellerChatRoomId,
        additionalReporterIds: [getAdminUserId()],
      });
    });

    afterAll(async () => {
      await wipeModerationMatrixPair({
        reporterId: buyerId(),
        subjectId: sellerId(),
        chatRoomId: buyerSellerChatRoomId,
        additionalReporterIds: [getAdminUserId()],
      });
      await clearSessionCache();
    });

    it("I-R3 profile report blocks chat-required offline trade category", async () => {
      await runAsBuyer(async () => {
        const result = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details: uniqueDetails("I-R3", runId),
            category: "offline_trade",
          }),
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("請在對話內使用舉報功能");
        }
      });
    });

    it("I-R1b rejects report when chat room counterparty mismatches target", async () => {
      await runAsBuyer(async () => {
        const result = await submitUserReport(
          buildChatReportInput({
            sellerId: getAdminUserId(),
            chatRoomId: buyerSellerChatRoomId,
            details: uniqueDetails("I-R1b", runId),
          }),
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("無法舉報此對話中的用戶");
        }
      });
    });

    it("I-R1 chat report succeeds", async () => {
      const details = uniqueDetails("I-R1", runId);

      await runAsBuyer(async () => {
        const result = await submitUserReport(
          buildChatReportInput({
            sellerId: sellerId(),
            chatRoomId: buyerSellerChatRoomId,
            details,
          }),
        );
        expect(result.success).toBe(true);
      });

      const report = await getLatestReport({
        reporterId: buyerId(),
        targetId: sellerId(),
      });
      expect(report).not.toBeNull();
      expect(report?.status).toBe("pending");
      expect(report?.reason).toContain("[SOURCE] chat_room");
      expect(report?.reason).toContain(details);
      expect(report?.contribution_score).toBe(44);
      expect(report?.case_id).toBeTruthy();
    });

    it("I-R2 profile report succeeds", async () => {
      const details = uniqueDetails("I-R2", runId);

      await runAsBuyer(async () => {
        const result = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details,
          }),
        );
        expect(result.success).toBe(true);
      });

      const report = await getLatestReport({
        reporterId: buyerId(),
        targetId: sellerId(),
      });
      expect(report).not.toBeNull();
      expect(report?.reason).toContain("[SOURCE] profile");
      expect(report?.reason).toContain(details);
      expect(report?.contribution_score).toBe(40);
      expect(report?.case_id).toBeTruthy();
    });

    it("I-R5 blocks duplicate profile report for same category", async () => {
      const details = uniqueDetails("I-R5", runId);

      await runAsBuyer(async () => {
        const first = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details,
          }),
        );
        expect(first.success).toBe(true);

        const second = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details: `${details} duplicate`,
          }),
        );
        expect(second.success).toBe(false);
        if (!second.success) {
          expect(second.error).toMatch(/同類別的待審核舉報/);
        }
      });

      expect(
        await countPendingReports({
          reporterId: buyerId(),
          targetId: sellerId(),
        }),
      ).toBe(1);
    });

    it("I-R4 aggregates chat and profile reports into same case", async () => {
      const chatDetails = uniqueDetails("I-R4-chat", runId);
      const profileDetails = uniqueDetails("I-R4-profile", runId);

      let caseId = "";

      await runAsBuyer(async () => {
        const chat = await submitUserReport(
          buildChatReportInput({
            sellerId: sellerId(),
            chatRoomId: buyerSellerChatRoomId,
            details: chatDetails,
          }),
        );
        expect(chat.success).toBe(true);
        if (chat.success) {
          caseId = chat.data.caseId;
        }

        const profile = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details: profileDetails,
          }),
        );
        expect(profile.success).toBe(true);
        if (profile.success) {
          expect(profile.data.caseId).toBe(caseId);
        }
      });

      const latest = await getLatestReport({
        reporterId: buyerId(),
        targetId: sellerId(),
      });
      expect(latest?.case_id).toBe(caseId);

      expect(
        await countPendingReports({
          reporterId: buyerId(),
          targetId: sellerId(),
        }),
      ).toBe(2);
    });

    it("I-M5 buyer cannot invoke admin moderation actions", async () => {
      const fakeCaseId = "00000000-0000-0000-0000-000000000099";

      await runAsBuyer(async () => {
        const search = await searchAdminModerationCases({ status: "pending" });
        expect(search.success).toBe(false);
        if (!search.success) {
          expect(search.error).toBe("無管理員權限");
        }

        const bundle = await getAdminModerationCase(fakeCaseId);
        expect(bundle.success).toBe(false);
        if (!bundle.success) {
          expect(bundle.error).toBe("無管理員權限");
        }

        const chat = await getAdminModerationChatThread({
          caseId: fakeCaseId,
          roomId: buyerSellerChatRoomId,
        });
        expect(chat.success).toBe(false);
        if (!chat.success) {
          expect(chat.error).toBe("無管理員權限");
        }

        const resolve = await resolveAdminModerationCase({
          caseId: fakeCaseId,
          ...mapResolutionOptionToInput("dismissed"),
        });
        expect(resolve.success).toBe(false);
        if (!resolve.success) {
          expect(resolve.error).toBe("無管理員權限");
        }
      });
    });

    it("I-M1 admin can search pending moderation cases", async () => {
      const details = uniqueDetails("I-M1", runId);
      let caseNumber = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildChatReportInput({
            sellerId: sellerId(),
            chatRoomId: buyerSellerChatRoomId,
            details,
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          caseNumber = submit.data.caseNumber;
        }
      });

      await runAsAdmin(async () => {
        const search = await searchAdminModerationCases({
          status: "pending",
          search: caseNumber,
        });
        expect(search.success).toBe(true);
        if (!search.success) {
          return;
        }
        expect(
          search.data.rows.some((row) => row.caseNumber === caseNumber),
        ).toBe(true);
      });
    });

    it("I-M2 admin case bundle includes submitted report", async () => {
      const details = uniqueDetails("I-M2", runId);
      let caseId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details,
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          caseId = submit.data.caseId;
        }
      });

      await runAsAdmin(async () => {
        const bundle = await getAdminModerationCase(caseId);
        expect(bundle.success).toBe(true);
        if (!bundle.success) {
          return;
        }
        expect(bundle.data.reports.length).toBeGreaterThan(0);
        expect(
          bundle.data.reports.some((report) => report.reason.includes(details)),
        ).toBe(true);
      });
    });

    it("I-M3 admin loads chat thread and writes view_chat audit", async () => {
      const details = uniqueDetails("I-M3", runId);
      const probe = `${MATRIX_PREFIX} ${runId} I-M3 probe`;
      let caseId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildChatReportInput({
            sellerId: sellerId(),
            chatRoomId: buyerSellerChatRoomId,
            details,
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          caseId = submit.data.caseId;
        }
      });

      await insertChatMessageProbe({
        roomId: buyerSellerChatRoomId,
        senderId: buyerId(),
        content: probe,
      });

      const auditBefore = await countModerationAuditLogsForCase(caseId, "view_chat");

      await runAsAdmin(async () => {
        const thread = await getAdminModerationChatThread({
          caseId,
          roomId: buyerSellerChatRoomId,
        });
        expect(thread.success).toBe(true);
        if (!thread.success) {
          return;
        }
        expect(
          thread.data.messages.some((message) => message.content.includes(probe)),
        ).toBe(true);
      });

      const auditAfter = await countModerationAuditLogsForCase(caseId, "view_chat");
      expect(auditAfter).toBeGreaterThan(auditBefore);
    });

    it("I-M4 admin adjusts moderation case score", async () => {
      const details = uniqueDetails("I-M4", runId);
      let caseId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details,
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          caseId = submit.data.caseId;
        }
      });

      const before = await getModerationCaseScores(caseId);
      expect(before).not.toBeNull();

      await runAsAdmin(async () => {
        const adjust = await adjustAdminModerationCaseScore({
          caseId,
          adjustment: 5,
          reason: `${MATRIX_PREFIX} score adjust`,
        });
        expect(adjust.success).toBe(true);
      });

      const after = await getModerationCaseScores(caseId);
      expect(after).not.toBeNull();
      expect(after!.adminAdjustment).toBe(before!.adminAdjustment + 5);
      expect(after!.finalScore).toBe(before!.finalScore + 5);
    });

    it("I-L1a dismiss case closes without sanctions", async () => {
      const details = uniqueDetails("I-L1a", runId);
      let caseId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details,
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          caseId = submit.data.caseId;
        }
      });

      const sanctionsBefore = await getActiveAccountSanctionsForUser(sellerId());

      await runAsAdmin(async () => {
        const resolve = await resolveAdminModerationCase({
          caseId,
          ...mapResolutionOptionToInput("dismissed"),
        });
        expect(resolve.success).toBe(true);
      });

      const status = await getModerationCaseStatus(caseId);
      expect(status?.status).toBe("dismissed");
      expect(status?.resolution).toBe("dismissed");

      const resolveAudit = await countModerationAuditLogsForCase(caseId, "resolve");
      expect(resolveAudit).toBeGreaterThan(0);

      const sanctionsAfter = await getActiveAccountSanctionsForUser(sellerId());
      expect(sanctionsAfter.length).toBe(sanctionsBefore.length);
    });

    it("I-L1b uphold with suspend penalty creates account sanction", async () => {
      const details = uniqueDetails("I-L1b", runId);
      let caseId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildChatReportInput({
            sellerId: sellerId(),
            chatRoomId: buyerSellerChatRoomId,
            details,
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          caseId = submit.data.caseId;
        }
      });

      await runAsAdmin(async () => {
        const resolve = await resolveAdminModerationCase({
          caseId,
          ...mapResolutionOptionToInput("suspend_7d", "member"),
        });
        expect(resolve.success).toBe(true);
      });

      const status = await getModerationCaseStatus(caseId);
      expect(status?.status).toBe("resolved");
      expect(status?.resolution).toBe("upheld");

      const sanctions = await getActiveAccountSanctionsForUser(sellerId());
      expect(
        sanctions.some(
          (row) => row.type === "suspend" && row.scope === "account",
        ),
      ).toBe(true);
    });

    it("I-E1 restrict member listing sets matrix listing inactive", async () => {
      const listing = await seedMatrixMemberListingForSeller(
        sellerId(),
        runId,
        "I-E1",
      );
      expect(await getListingStatus(listing.listingId)).toBe("active");

      const details = uniqueDetails("I-E1", runId);
      let caseId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details,
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          caseId = submit.data.caseId;
        }
      });

      await runAsAdmin(async () => {
        const resolve = await resolveAdminModerationCase({
          caseId,
          ...mapResolutionOptionToInput("restrict_member_listing", "member"),
        });
        expect(resolve.success).toBe(true);
      });

      expect(await getListingStatus(listing.listingId)).toBe("inactive");

      const sanctions = await getActiveAccountSanctionsForUser(sellerId());
      expect(
        sanctions.some(
          (row) =>
            row.type === "restrict_listing" && row.scope === "member_persona",
        ),
      ).toBe(true);
    });

    it("I-E2 freeze payout sets member order seller_payout_status frozen", async () => {
      const listing = await seedMatrixMemberListingForSeller(
        sellerId(),
        runId,
        "I-E2",
      );
      const orderId = await seedMemberOrderWithPayoutReady({
        buyerId: buyerId(),
        sellerId: sellerId(),
        listingId: listing.listingId,
      });

      expect(await getMemberOrderPayoutStatus(orderId)).toBe("ready");

      const details = uniqueDetails("I-E2", runId);
      let caseId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details,
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          caseId = submit.data.caseId;
        }
      });

      await runAsAdmin(async () => {
        const resolve = await resolveAdminModerationCase({
          caseId,
          ...mapResolutionOptionToInput("freeze_payout", "member"),
        });
        expect(resolve.success).toBe(true);
      });

      expect(await getMemberOrderPayoutStatus(orderId)).toBe("frozen");
    });

    it("I-E3 suspend blocks seller chat sendMessage", async () => {
      const details = uniqueDetails("I-E3", runId);
      let caseId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildChatReportInput({
            sellerId: sellerId(),
            chatRoomId: buyerSellerChatRoomId,
            details,
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          caseId = submit.data.caseId;
        }
      });

      await runAsAdmin(async () => {
        const resolve = await resolveAdminModerationCase({
          caseId,
          ...mapResolutionOptionToInput("suspend_7d", "member"),
        });
        expect(resolve.success).toBe(true);
      });

      await runAsSeller(async () => {
        const result = await sendMessage(
          buyerSellerChatRoomId,
          `${MATRIX_PREFIX} I-E3 blocked probe`,
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain("帳戶已受限，無法執行此操作");
        }
      });
    });

    it("I-E4 evidence override required when chat evidence insufficient", async () => {
      const insufficient = await seedInsufficientEvidenceCase({
        reporterId: getAdminUserId(),
        subjectId: sellerId(),
        runId,
        suffix: "I-E4",
        category: "harassment",
      });

      await runAsAdmin(async () => {
        const blocked = await resolveAdminModerationCase({
          caseId: insufficient.caseId,
          ...mapResolutionOptionToInput("suspend_7d", "member"),
        });
        expect(blocked.success).toBe(false);
        if (!blocked.success) {
          expect(blocked.error).toMatch(/證據不足/);
        }
      });

      await runAsAdmin(async () => {
        const resolve = await resolveAdminModerationCase({
          caseId: insufficient.caseId,
          ...mapResolutionOptionToInput("suspend_7d", "member"),
          evidenceOverrideReason: "I-E4 matrix override",
        });
        expect(resolve.success).toBe(true);
      });

      const status = await getModerationCaseStatus(insufficient.caseId);
      expect(status?.status).toBe("resolved");
      expect(status?.resolution).toBe("upheld");

      const auditPayload = await getResolveAuditPayload(insufficient.caseId);
      expect(auditPayload?.evidenceOverrideReason).toBe("I-E4 matrix override");
    });

    it("I-E5 expired suspend clears account access restriction", async () => {
      await expireAccountAccessSanctionsForUser(sellerId());

      const details = uniqueDetails("I-E5", runId);
      let caseId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildChatReportInput({
            sellerId: sellerId(),
            chatRoomId: buyerSellerChatRoomId,
            details,
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          caseId = submit.data.caseId;
        }
      });

      await runAsAdmin(async () => {
        const resolve = await resolveAdminModerationCase({
          caseId,
          ...mapResolutionOptionToInput("suspend_7d", "member"),
        });
        expect(resolve.success).toBe(true);
      });

      await runAsSeller(async () => {
        const restricted = await getAccountAccessRestriction(
          getSellerClient(),
          sellerId(),
        );
        expect(restricted.blocked).toBe(true);
      });

      await expireSanctionForCase(caseId, "suspend");

      await runAsSeller(async () => {
        const restriction = await getAccountAccessRestriction(
          getSellerClient(),
          sellerId(),
        );
        expect(restriction.blocked).toBe(false);
      });
    });

    it("I-G1 subject history returns prior upheld case excluding current", async () => {
      const priorDetails = uniqueDetails("I-G1-prior", runId);
      let priorCaseId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details: priorDetails,
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          priorCaseId = submit.data.caseId;
        }
      });

      await runAsAdmin(async () => {
        const resolve = await resolveAdminModerationCase({
          caseId: priorCaseId,
          ...mapResolutionOptionToInput("dismissed"),
        });
        expect(resolve.success).toBe(true);
      });

      const currentDetails = uniqueDetails("I-G1-current", runId);
      let currentCaseId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildChatReportInput({
            sellerId: sellerId(),
            chatRoomId: buyerSellerChatRoomId,
            details: currentDetails,
            category: "harassment",
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          currentCaseId = submit.data.caseId;
        }
      });

      await runAsAdmin(async () => {
        const history = await getAdminSubjectModerationHistory({
          subjectUserId: sellerId(),
          excludeCaseId: currentCaseId,
        });
        expect(history.success).toBe(true);
        if (!history.success) {
          return;
        }
        expect(history.data.stats.priorCaseCount).toBeGreaterThanOrEqual(1);
        expect(
          history.data.priorCases.some((row) => row.id === priorCaseId),
        ).toBe(true);
        expect(
          history.data.priorCases.every((row) => row.id !== currentCaseId),
        ).toBe(true);
      });
    });

    it("I-G2 expired suspend appears as expired in sanction history", async () => {
      await expireAccountAccessSanctionsForUser(sellerId());

      const details = uniqueDetails("I-G2", runId);
      let caseId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildChatReportInput({
            sellerId: sellerId(),
            chatRoomId: buyerSellerChatRoomId,
            details,
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          caseId = submit.data.caseId;
        }
      });

      await runAsAdmin(async () => {
        const resolve = await resolveAdminModerationCase({
          caseId,
          ...mapResolutionOptionToInput("suspend_7d", "member"),
        });
        expect(resolve.success).toBe(true);
      });

      await expireSanctionForCase(caseId, "suspend");

      await runAsAdmin(async () => {
        const history = await getAdminSubjectModerationHistory({
          subjectUserId: sellerId(),
          excludeCaseId: caseId,
        });
        expect(history.success).toBe(true);
        if (!history.success) {
          return;
        }
        const expired = history.data.sanctionHistory.find(
          (row) => row.caseId === caseId && row.status === "expired",
        );
        expect(expired).toBeTruthy();
      });
    });

    it("I-G3 buyer cannot load subject moderation history", async () => {
      await runAsBuyer(async () => {
        const history = await getAdminSubjectModerationHistory({
          subjectUserId: sellerId(),
        });
        expect(history.success).toBe(false);
        if (!history.success) {
          expect(history.error).toBe("無管理員權限");
        }
      });
    });

    it("I-N1 resolve dismiss leaves unacknowledged report outcome for reporter", async () => {
      const details = uniqueDetails("I-N1", runId);
      let reportId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details,
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          reportId = submit.data.reportId;
        }
      });

      const report = await getLatestReport({
        reporterId: buyerId(),
        targetId: sellerId(),
      });
      expect(report?.case_id).toBeTruthy();

      await runAsAdmin(async () => {
        const resolve = await resolveAdminModerationCase({
          caseId: report!.case_id!,
          ...mapResolutionOptionToInput("dismissed"),
          notifyReporter: true,
        });
        expect(resolve.success).toBe(true);
      });

      await runAsBuyer(async () => {
        const outcomes = await getUnacknowledgedReportOutcomes();
        expect(outcomes.success).toBe(true);
        if (!outcomes.success) {
          return;
        }
        expect(
          outcomes.data.some((row) => row.reportId === reportId),
        ).toBe(true);
        expect(outcomes.data[0]?.message).toMatch(/已結案/);
      });
    });

    it("I-N2 acknowledge_report_outcomes clears pending queue", async () => {
      const details = uniqueDetails("I-N2", runId);
      let reportId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details,
            category: "other",
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          reportId = submit.data.reportId;
        }
      });

      const report = await getLatestReport({
        reporterId: buyerId(),
        targetId: sellerId(),
      });

      await runAsAdmin(async () => {
        const resolve = await resolveAdminModerationCase({
          caseId: report!.case_id!,
          ...mapResolutionOptionToInput("insufficient_evidence"),
        });
        expect(resolve.success).toBe(true);
      });

      expect(await getModerationCaseResolution(report!.case_id!)).toBe(
        "insufficient_evidence",
      );
      const resolvedReport = await getLatestReport({
        reporterId: buyerId(),
        targetId: sellerId(),
      });
      expect(resolvedReport?.status).toBe("dismissed");

      await runAsBuyer(async () => {
        const pending = await getUnacknowledgedReportOutcomes();
        expect(pending.success).toBe(true);
        if (!pending.success) {
          return;
        }
        expect(pending.data.some((row) => row.reportId === reportId)).toBe(true);

        const ack = await acknowledgeReportOutcomes([reportId]);
        expect(ack.success).toBe(true);

        const after = await getUnacknowledgedReportOutcomes();
        expect(after.success).toBe(true);
        if (after.success) {
          expect(after.data).toHaveLength(0);
        }
      });
    });

    it("I-N3 resolve with notifyReporter false suppresses outcome queue", async () => {
      const details = uniqueDetails("I-N3", runId);
      let reportId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildChatReportInput({
            sellerId: sellerId(),
            chatRoomId: buyerSellerChatRoomId,
            details,
            category: "other",
          }),
        );
        expect(submit.success).toBe(true);
        if (!submit.success) {
          return;
        }
        reportId = submit.data.reportId;

        await runAsAdmin(async () => {
          const resolve = await resolveAdminModerationCase({
            caseId: submit.data.caseId,
            ...mapResolutionOptionToInput("dismissed"),
            notifyReporter: false,
          });
          expect(resolve.success).toBe(true);
        });

        const outcomes = await getUnacknowledgedReportOutcomes();
        expect(outcomes.success).toBe(true);
        if (outcomes.success) {
          expect(
            outcomes.data.some((row) => row.reportId === submit.data.reportId),
          ).toBe(false);
        }
      });

      const ackState = await getOutcomeAckState(reportId);
      expect(ackState?.outcomeAcknowledgedAt).toBeTruthy();
    });

    it("I-R6 chat duplicate blocked while profile pending report allowed", async () => {
      const chatDetails = uniqueDetails("I-R6-chat", runId);
      const profileDetails = uniqueDetails("I-R6-profile", runId);

      await runAsBuyer(async () => {
        const chat = await submitUserReport(
          buildChatReportInput({
            sellerId: sellerId(),
            chatRoomId: buyerSellerChatRoomId,
            details: chatDetails,
          }),
        );
        expect(chat.success).toBe(true);

        const duplicateChat = await submitUserReport(
          buildChatReportInput({
            sellerId: sellerId(),
            chatRoomId: buyerSellerChatRoomId,
            details: `${chatDetails} retry`,
          }),
        );
        expect(duplicateChat.success).toBe(false);
        if (!duplicateChat.success) {
          expect(duplicateChat.error).toMatch(/此對話提交過待審核的舉報/);
        }

        const profile = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details: profileDetails,
          }),
        );
        expect(profile.success).toBe(true);
      });

      expect(
        await countPendingReports({
          reporterId: buyerId(),
          targetId: sellerId(),
        }),
      ).toBe(2);
    });

    it("I-G4 upheldCount and subjectPriorUpheldCount only count upheld resolutions", async () => {
      const dismissedDetails = uniqueDetails("I-G4-dismissed", runId);
      let dismissedCaseId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details: dismissedDetails,
            category: "other",
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          dismissedCaseId = submit.data.caseId;
        }
      });

      await runAsAdmin(async () => {
        const resolve = await resolveAdminModerationCase({
          caseId: dismissedCaseId,
          ...mapResolutionOptionToInput("dismissed"),
        });
        expect(resolve.success).toBe(true);
      });

      const upheldDetails = uniqueDetails("I-G4-upheld", runId);
      let upheldCaseId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildChatReportInput({
            sellerId: sellerId(),
            chatRoomId: buyerSellerChatRoomId,
            details: upheldDetails,
            category: "harassment",
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          upheldCaseId = submit.data.caseId;
        }
      });

      await runAsAdmin(async () => {
        const resolve = await resolveAdminModerationCase({
          caseId: upheldCaseId,
          ...mapResolutionOptionToInput("suspend_7d", "member"),
        });
        expect(resolve.success).toBe(true);
      });

      const currentDetails = uniqueDetails("I-G4-current", runId);
      let currentCaseId = "";
      let currentCaseNumber = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details: currentDetails,
            category: "fraud",
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          currentCaseId = submit.data.caseId;
          currentCaseNumber = submit.data.caseNumber;
        }
      });

      await runAsAdmin(async () => {
        const history = await getAdminSubjectModerationHistory({
          subjectUserId: sellerId(),
          excludeCaseId: currentCaseId,
        });
        expect(history.success).toBe(true);
        if (!history.success) {
          return;
        }
        expect(history.data.stats.upheldCount).toBe(1);
        expect(history.data.stats.priorCaseCount).toBeGreaterThanOrEqual(2);

        const search = await searchAdminModerationCases({
          status: "pending",
          search: currentCaseNumber,
        });
        expect(search.success).toBe(true);
        if (!search.success) {
          return;
        }
        const row = search.data.rows.find((entry) => entry.id === currentCaseId);
        expect(row).toBeTruthy();
        expect((row?.subjectPriorUpheldCount ?? 0) >= 1).toBe(true);
      });
    });

    it("I-L3 double resolve on closed case is rejected", async () => {
      const details = uniqueDetails("I-L3", runId);
      let caseId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details,
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          caseId = submit.data.caseId;
        }
      });

      await runAsAdmin(async () => {
        const first = await resolveAdminModerationCase({
          caseId,
          ...mapResolutionOptionToInput("dismissed"),
        });
        expect(first.success).toBe(true);

        const second = await resolveAdminModerationCase({
          caseId,
          ...mapResolutionOptionToInput("dismissed"),
        });
        expect(second.success).toBe(false);
        if (!second.success) {
          expect(second.error).toMatch(/案件已結案/);
        }
      });
    });

    it("I-N4 outcome queue exposes case resolution not report status", async () => {
      const details = uniqueDetails("I-N4", runId);
      let reportId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details,
            category: "other",
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          reportId = submit.data.reportId;
        }
      });

      const report = await getLatestReport({
        reporterId: buyerId(),
        targetId: sellerId(),
      });

      await runAsAdmin(async () => {
        const resolve = await resolveAdminModerationCase({
          caseId: report!.case_id!,
          ...mapResolutionOptionToInput("insufficient_evidence"),
          notifyReporter: true,
        });
        expect(resolve.success).toBe(true);
      });

      await runAsBuyer(async () => {
        const outcomes = await getUnacknowledgedReportOutcomes();
        expect(outcomes.success).toBe(true);
        if (!outcomes.success) {
          return;
        }
        const row = outcomes.data.find((entry) => entry.reportId === reportId);
        expect(row).toBeTruthy();
        expect(row?.resolution).toBe("insufficient_evidence");
        expect(row?.message).toMatch(/證據不足/);
      });
    });

    it("I-N5 acknowledge_report_outcomes is idempotent", async () => {
      const details = uniqueDetails("I-N5", runId);
      let reportId = "";

      await runAsBuyer(async () => {
        const submit = await submitUserReport(
          buildProfileReportInput({
            sellerId: sellerId(),
            details,
            category: "fraud",
          }),
        );
        expect(submit.success).toBe(true);
        if (submit.success) {
          reportId = submit.data.reportId;
        }
      });

      const report = await getLatestReport({
        reporterId: buyerId(),
        targetId: sellerId(),
      });

      await runAsAdmin(async () => {
        const resolve = await resolveAdminModerationCase({
          caseId: report!.case_id!,
          ...mapResolutionOptionToInput("dismissed"),
        });
        expect(resolve.success).toBe(true);
      });

      await runAsBuyer(async () => {
        const first = await acknowledgeReportOutcomes([reportId]);
        expect(first.success).toBe(true);
        if (first.success) {
          expect(first.updated).toBeGreaterThanOrEqual(1);
        }

        const second = await acknowledgeReportOutcomes([reportId]);
        expect(second.success).toBe(true);
        if (second.success) {
          expect(second.updated).toBe(0);
        }
      });
    });

    it(
      "I-N6 non-reporter cannot fetch or ack another user outcomes",
      async () => {
        const details = uniqueDetails("I-N6", runId);
        let reportId = "";

        await runAsBuyer(async () => {
          const submit = await submitUserReport(
            buildProfileReportInput({
              sellerId: sellerId(),
              details,
            }),
          );
          expect(submit.success).toBe(true);
          if (submit.success) {
            reportId = submit.data.reportId;
          }
        });

        const report = await getLatestReport({
          reporterId: buyerId(),
          targetId: sellerId(),
        });

        await runAsAdmin(async () => {
          const resolve = await resolveAdminModerationCase({
            caseId: report!.case_id!,
            ...mapResolutionOptionToInput("dismissed"),
          });
          expect(resolve.success).toBe(true);
        });

        await runAsSeller(async () => {
          const outcomes = await getUnacknowledgedReportOutcomes();
          expect(outcomes.success).toBe(true);
          if (outcomes.success) {
            expect(outcomes.data.some((row) => row.reportId === reportId)).toBe(
              false,
            );
          }

          const ack = await acknowledgeReportOutcomes([reportId]);
          expect(ack.success).toBe(true);
          if (ack.success) {
            expect(ack.updated).toBe(0);
          }
        });

        await runAsBuyer(async () => {
          const outcomes = await getUnacknowledgedReportOutcomes();
          expect(outcomes.success).toBe(true);
          if (outcomes.success) {
            expect(outcomes.data.some((row) => row.reportId === reportId)).toBe(
              true,
            );
          }
        });
      });

    it("I-N7 legacy resolved reports with ack do not appear in outcome queue", async () => {
      const legacy = await insertLegacyResolvedReportFixture({
        reporterId: buyerId(),
        subjectId: sellerId(),
        adminId: getAdminUserId(),
        runId,
        suffix: "N7",
      });

      await runAsBuyer(async () => {
        const outcomes = await getUnacknowledgedReportOutcomes();
        expect(outcomes.success).toBe(true);
        if (outcomes.success) {
          expect(
            outcomes.data.some((row) => row.reportId === legacy.reportId),
          ).toBe(false);
        }
      });

      const admin = createServiceRoleClient();
      await admin.from("reports").delete().eq("id", legacy.reportId);
      await admin.from("moderation_cases").delete().eq("id", legacy.caseId);
    });
  },
);
