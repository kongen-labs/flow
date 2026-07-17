/**
 * "How Flow works" + "What data we save" — the transparency surface for the
 * privacy wedge.
 *
 * COPY IS VERBATIM from Kongen Labs' claims-audited "how it works and
 * data" copy (Pin/Ignore vocabulary revision). Do NOT paraphrase or
 * "improve" wording here — every sentence is written to be literally true
 * of the current build; the approved source copy changes first, then is
 * re-ported. Gates cross-checked against lib/context.ts + the renamed UI:
 * ignored excluded in BOTH scopes incl. the per-prompt full-history chip
 * (test-pinned), auto-suggested pins display identically to manual ones,
 * labels exactly Pin/Ignore(d)/"chain view".
 *
 * TODO: key-mint flow — revisit the "What leaves your device" list when
 * an in-app mint flow ships.
 *
 * Rendered from the settings sheet (expandable section) and first-run
 * (trust link at the moment we ask for keys). Mobile-first: plain stacked
 * text blocks, no fixed widths, works at 375px inside the bottom sheet.
 */

const HOW_IT_WORKS: { lead: string; rest: string }[] = [
  {
    lead: "Your keys, your models.",
    rest: "You add your own API keys — Anthropic, OpenAI, Google, Mistral, DeepSeek. They're stored in this browser and used from it.",
  },
  {
    lead: "Auto mode scores each prompt.",
    rest: "When you send a prompt on Auto, Flow sends that prompt's text to Kongen, which scores how much reasoning it needs.",
  },
  {
    lead: "The score picks the model.",
    rest: "Light models for quick asks, frontier models for hard problems. Pin a model instead and step 2 is skipped — pinned prompts are never sent to Kongen. If scoring is ever unreachable, Flow falls back to your default model and says so.",
  },
  {
    lead: "Only the relevant part of your conversation is referenced.",
    rest: "Flow forwards the messages your new prompt relates to — its topic chain, your last two exchanges, and any pinned messages. Starting a new topic? Only the recent exchanges and pinned messages go along. The chain view shows exactly what was included, what was left out, and why — and you can include the full history for any prompt when you want to.",
  },
  {
    lead: "Answers stream direct.",
    rest: "The reply goes straight from the provider to your browser, using your own key. It never passes through Kongen.",
  },
  {
    lead: "Everything stays here.",
    rest: "Conversations are saved on this device and nowhere else. Export them as JSON anytime; import them anywhere.",
  },
];

const STAYS_ON_DEVICE: { lead: string; rest: string }[] = [
  {
    lead: "Your conversations.",
    rest: "Every message, in this browser's local database. No server copy exists. Deleting a conversation here deletes it everywhere, because there is no elsewhere. Export/import as JSON.",
  },
  {
    lead: "Your API keys.",
    rest: "Provider keys and your Kongen key, in this browser's local storage. Each key is sent only to its own service when you use it — your Anthropic key to Anthropic, your Kongen key to Kongen — and to no one else.",
  },
  {
    lead: "Message signals.",
    rest: "The Pin and Ignore markers on messages — whether you set them or Flow suggests them — are computed in the app and stored with your messages, locally.",
  },
  {
    lead: "Routing details.",
    rest: "The per-reply model, cost, and savings info shown in the app is stored locally with the message.",
  },
];

// The dismissed-messages sentence is kept: the dismiss/ghost UX IS
// discoverable in v1 (the info toggle on every message opens the Relevance
// selector with the ghost option), and the exclusion is enforced in
// lib/context.ts selectContext(). If that UX is ever hidden, cut the
// sentence.
const LEAVES_DEVICE: { lead: string; rest: string }[] = [
  {
    lead: "The relevant part of your conversation → your model provider.",
    rest: "For each prompt, Flow sends the messages it relates to — the prompt's topic chain, your last two exchanges, and any pinned messages — not your whole history. Less of your conversation leaves your device, and fewer input tokens land on your bill. Ignored messages are never sent — even when you include full history — but they stay in your local history. The chain view shows exactly what was included and what was left out. Choose \"include full history\" and everything except ignored messages is sent for that prompt. Everything goes with your own key, under that provider's terms.",
  },
  {
    lead: "On Auto mode, each new prompt's text → Kongen",
    rest: ", to score its complexity. Just that prompt — not your conversation history. Kongen records the routing decision it made (regime, confidence, chosen model), not your prompt's text.",
    // NOTE: no space before "rest" — the doc's sentence continues the bold
    // lead with a comma.
  },
  // TODO: key-mint flow — an email bullet goes here once a mint flow
  // ships (see header comment).
  {
    lead: "Model answers never go to Kongen.",
    rest: "They stream provider → browser. Kongen scores questions; it never sees answers or conversations.",
  },
  {
    lead: "Nothing else.",
    rest: "No analytics or tracking SDK runs in this app.",
  },
];

function Item({ lead, rest, joined }: { lead: string; rest: string; joined?: boolean }) {
  return (
    <li className="text-[11px] leading-relaxed text-muted-foreground">
      <strong className="font-semibold text-foreground">{lead}</strong>
      {joined ? rest : ` ${rest}`}
    </li>
  );
}

export function AboutFlowContent() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-foreground">
          How Flow works
        </h4>
        <ol className="list-decimal space-y-1.5 pl-4">
          {HOW_IT_WORKS.map((item) => (
            <Item key={item.lead} lead={item.lead} rest={item.rest} />
          ))}
        </ol>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-foreground">
          What data we save
        </h4>

        <div className="space-y-1.5">
          <h5 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Stays on your device
          </h5>
          <ul className="list-disc space-y-1.5 pl-4">
            {STAYS_ON_DEVICE.map((item) => (
              <Item key={item.lead} lead={item.lead} rest={item.rest} />
            ))}
          </ul>
        </div>

        <div className="space-y-1.5">
          <h5 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            What leaves your device, and where it goes
          </h5>
          <ul className="list-disc space-y-1.5 pl-4">
            {LEAVES_DEVICE.map((item) => (
              <Item
                key={item.lead}
                lead={item.lead}
                rest={item.rest}
                joined={item.rest.startsWith(",")}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
