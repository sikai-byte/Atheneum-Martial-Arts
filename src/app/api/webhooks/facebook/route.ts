import { NextResponse } from "next/server";
import { intakeLead } from "@/lib/leads/engine";
import {
  fetchLeadFromGraph,
  mapGraphLead,
  verifySignature,
  type GraphFieldData,
} from "@/lib/leads/facebook";

export const dynamic = "force-dynamic";

/** Facebook webhook subscription handshake. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const expected = process.env.FB_VERIFY_TOKEN;
  if (
    params.get("hub.mode") === "subscribe" &&
    expected &&
    params.get("hub.verify_token") === expected
  ) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Verification failed", { status: 403 });
}

type LeadgenChange = {
  value?: { leadgen_id?: string; form_id?: string; field_data?: GraphFieldData[] };
};

/**
 * Receives Facebook Lead Ads submissions and starts follow-up immediately. Facebook retries on
 * non-200s, so failures for a single lead are reported in the body while the response stays 200
 * unless nothing could be processed at all.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { entry?: { changes?: LeadgenChange[] }[] };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const results: { leadgenId: string; status: string; detail?: string }[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const leadgenId = change.value?.leadgen_id;
      if (!leadgenId) continue;
      try {
        // Facebook only sends the id; the answers come from the Graph API. A payload that
        // inlines field_data (used by our own tests) is accepted as-is.
        const inline = change.value?.field_data;
        const graph = inline
          ? { fieldData: inline, createdTime: undefined, formName: undefined, campaignName: undefined }
          : await fetchLeadFromGraph(leadgenId);
        const input = mapGraphLead(leadgenId, graph.fieldData, graph);
        const { lead } = await intakeLead(input);
        results.push({ leadgenId, status: "accepted", detail: lead.id });
      } catch (error) {
        console.error("[facebook-webhook] lead failed", leadgenId, error);
        results.push({
          leadgenId,
          status: "failed",
          detail: error instanceof Error ? error.message : "unknown error",
        });
      }
    }
  }

  return NextResponse.json({ received: results.length, results });
}
