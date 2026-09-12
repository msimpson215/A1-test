import { shelves } from "@/data/dierbergs-catalogue";
import { forSpeaking } from "./dierbergs-pronounce";

/**
 * A spoken line to the OpenAI Realtime API.
 *
 * The shopper talks and is answered in voice, with no transcription step in
 * between and no separate text-to-speech afterwards. The model hears the
 * audio and produces audio, which is why it can be interrupted mid-sentence
 * and why it sounds like someone talking rather than something reading.
 *
 * The store is given to it as tools: it decides what belongs on the shelf and
 * what goes in the cart, and the demo carries that out.
 */

export type ShopperState = "connecting" | "idle" | "listening" | "thinking" | "speaking";

export type ShopperTools = {
  /** Put an aisle on the shelf. Returns what to tell the model happened. */
  showProducts(aisle: string, productIds: string[]): string;
  /** Put one product in the cart, resolving once it has landed there. */
  addToCart(productId: string): Promise<string>;
};

export type ShopperHandlers = {
  onState(state: ShopperState): void;
  /** What the shopper was heard to say. */
  onHeard(text: string): void;
  /** What the assistant said, for the strip. */
  onSaid(text: string): void;
  onError(message: string): void;
};

export type ShopperSession = {
  /** Send typed words down the same line, so text and voice share one mind. */
  send(text: string): void;
  close(): void;
};

const BRIEF = `You are helping a customer shop on the Dierbergs grocery website.
Dierbergs is pronounced "Deerbergs".

You are talking out loud with someone looking at the Dierbergs storefront.
Talk like a good person working the floor: warm, brief, and never scripted.
One or two sentences at a time. No lists, no prices read out unless they
matter, no markdown, and never mention tools, functions or ids.

Never call yourself an AI shopper, a chatbot, or an assistant. Never say
"tell me what you're after." Do not sound like a kiosk.

Open with: "Welcome to Dierbergs. How can I help you with your shopping
today?" Then stop and listen. Do not say you know the whole store.

You have the store's shelves below. Use show_products to change what the
customer is looking at, and add_to_cart to put something in their cart.

- Anything they ask about groceries should change the shelf. Do not describe
  products they cannot see: show them.
- A bare aisle request ("I need bread") must show one of each kind, up to
  eight, not the first four in the list. Bread must include rye and bagels.
  Cheese must include Swiss, provolone and mozzarella, not four cheddars.
- Milk is a capsule, and a clerk does not dump eighty cartons on the counter.
  A bare "I need milk" shows the Dierbergs store-brand whole milk in a gallon
  and a half gallon, and asks if they want to save money with that. The live
  store does not sell a Dierbergs quart; if they ask for a quart or a quarter,
  say so and keep the gallon and half gallon on the shelf.
- "A gallon", "a whole gallon", "half gallon" and "a half gallon" are milk
  even if they never say the word milk. "A whole gallon" is the gallon size,
  not a request for whole-milk fat.
- If milk is already on the shelf and they change size, switch the size. Do
  not restart, and do not list milk, eggs, bread and cheese.
- If they name a fat level (two percent, skim) and no other brand, show the
  Dierbergs of that fat in the sizes we have. If they name Prairie Farms,
  Lactaid, Horizon, fairlife, a2, Organic Valley or Kalona, show that brand.
  If they say no, something else, or what other milks, show the other brands.
  Every carton on the shelf can go in the cart.
- Only add_to_cart when one product is clearly the one they mean. If more than
  one still fits, show exactly those and ask which. Clicking the plus on a
  card also adds that carton.
- Never add something they did not ask for.
- If they rule something out, respect it.
- Call the tool first, then speak. The shelf should change as you talk.

Following the conversation:
- Keep track of what is on the shelf and what order it is in. "That one", "the
  second one", "the cheaper one", "the big one" and "no, the other one" all
  refer to what they are looking at right now.
- "The wheat one" or "the sharp one" means the one on the shelf whose kind or
  attributes match. Narrow to it rather than starting over.
- A correction like "no, I meant sourdough" replaces what they asked for; it
  does not add to it. If they ask for a half gallon and then a whole gallon,
  honour the latest size.
- Wait until they have finished speaking. A short or partial line is not an
  excuse to recap the store.
- A bare "the cheese" means the cheese they asked for earlier, if there is
  only one of those.
- They should never have to say a full product name twice.

What you know and what you do not:
- Every product's kind, brand, form, size, price and diet badges are below.
  Compare on those freely: cheapest, largest, which brands, what forms.
- The diet list is only what Dierbergs marks on the product. Call something
  organic, gluten free, keto or lactose free only if it is listed there. If it
  is not listed, say the store does not flag it, not that it is not.
- You have no ratings, no reviews and no nutrition figures. If they ask which
  is best rated or healthiest, say plainly that you do not have ratings, then
  offer to compare on price, size, brand or kind instead.
- If they ask for something this store clearly does not carry (bananas,
  toothpaste), say so and offer milk, eggs, bread or cheese. Never use that
  list as a fallback for a size, a brand, a correction, or a line you did not
  catch. Never invent a product, a price or a claim.`;

const TOOLS = [
  {
    type: "function",
    name: "show_products",
    description: "Put products on the Dierbergs shelf in front of the customer.",
    parameters: {
      type: "object",
      properties: {
        aisle: { type: "string", description: "id of the aisle these belong to" },
        product_ids: {
          type: "array",
          items: { type: "string" },
          description: "product ids from the catalogue. On a bare bread or cheese request, one of each kind (up to eight). On a bare milk request, the Dierbergs gallon and half gallon."
        }
      },
      required: ["aisle", "product_ids"]
    }
  },
  {
    type: "function",
    name: "add_to_cart",
    description: "Put one product into the customer's cart. It flies into the cart on screen.",
    parameters: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "id of the single product to add" }
      },
      required: ["product_id"]
    }
  }
];

/**
 * The cells, as the model sees them.
 *
 * Each product goes down with the attributes a shopper actually chooses
 * between — what kind it is, whose it is, how it is cut, how big, how much —
 * so that "the wheat one", "the cheaper one" and "shredded, not sliced" are
 * answerable from the data instead of from a guess at the product name.
 *
 * Keys are short because this rides in the session instructions on every
 * connection, and there are a hundred products.
 */
function catalogueForModel(): string {
  return JSON.stringify(
    shelves.map((shelf) => ({
      aisle: shelf.id,
      products: shelf.products.map((p) => ({
        id: p.id,
        name: forSpeaking(p.name),
        brand: p.brand,
        kind: p.subcategory,
        also: p.type?.length ? p.type : undefined,
        form: p.form,
        size: p.size,
        price: p.price,
        diet: p.dietary?.length ? p.dietary : undefined
      }))
    }))
  );
}

export function realtimeSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof RTCPeerConnection !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export async function connectShopper(
  tools: ShopperTools,
  handlers: ShopperHandlers
): Promise<ShopperSession> {
  handlers.onState("connecting");

  const mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });

  const pc = new RTCPeerConnection();
  const dc = pc.createDataChannel("oai-events");

  const audio = document.createElement("audio");
  audio.autoplay = true;
  document.body.appendChild(audio);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try { dc.close(); } catch { /* already gone */ }
    try { pc.close(); } catch { /* already gone */ }
    for (const track of mic.getTracks()) track.stop();
    audio.remove();
    handlers.onState("idle");
  };

  pc.ontrack = (event) => {
    if (audio.srcObject !== event.streams[0]) audio.srcObject = event.streams[0];
    void audio.play().catch(() => { /* autoplay rules; the gesture that opened this covers it */ });
  };

  const send = (payload: unknown) => {
    if (dc.readyState === "open") dc.send(JSON.stringify(payload));
  };

  /*
   * The API allows one response at a time. Three things want to start one —
   * the greeting, a typed line, and the answer to a tool call — and the
   * server starts its own whenever it hears the shopper stop talking. Asking
   * while one is running is an error, and the request is simply dropped,
   * which is how a tool call ends with the shelf changed and nothing said.
   */
  let responding = false;
  let queued = false;

  const requestResponse = () => {
    if (responding) {
      queued = true;
      return;
    }
    responding = true;
    send({ type: "response.create" });
  };

  dc.addEventListener("open", () => {
    send({
      type: "session.update",
      session: {
        type: "realtime",
        instructions: `${BRIEF}\n\nThe shelves:\n${catalogueForModel()}`,
        tools: TOOLS,
        tool_choice: "auto"
      }
    });
    // Nothing has been said yet, so ask for the opening line explicitly.
    requestResponse();
  });

  dc.addEventListener("message", (event) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    void route(msg);
  });

  async function route(msg: Record<string, unknown>) {
    const type = String(msg.type || "");

    if (type === "input_audio_buffer.speech_started") {
      handlers.onState("listening");
      return;
    }
    if (type === "input_audio_buffer.speech_stopped") {
      handlers.onState("thinking");
      return;
    }
    if (type === "response.created") {
      responding = true;
      handlers.onState("speaking");
      return;
    }
    if (type === "response.done") {
      responding = false;
      handlers.onState("listening");
      if (queued) {
        queued = false;
        requestResponse();
      }
      return;
    }
    if (type === "output_audio_buffer.stopped") {
      handlers.onState("listening");
      return;
    }
    if (type.endsWith("input_audio_transcription.completed")) {
      const heard = String(msg.transcript || "").trim();
      if (heard) handlers.onHeard(heard);
      return;
    }
    if (
      (type === "response.audio_transcript.done" ||
        type === "response.output_audio_transcript.done") &&
      msg.transcript
    ) {
      handlers.onSaid(String(msg.transcript));
      return;
    }
    if (type === "error") {
      const detail = msg.error as { message?: string } | undefined;
      handlers.onError(detail?.message || "The line dropped.");
      return;
    }

    const call = functionCall(msg);
    if (call) await runTool(call);
  }

  async function runTool(call: { call_id: string; name: string; arguments: string }) {
    let args: { aisle?: string; product_ids?: string[]; product_id?: string } = {};
    try {
      args = JSON.parse(call.arguments || "{}");
    } catch { /* the model sent something odd; treat as empty */ }

    let output = "done";
    try {
      if (call.name === "show_products") {
        output = tools.showProducts(args.aisle || "", args.product_ids || []);
      } else if (call.name === "add_to_cart" && args.product_id) {
        output = await tools.addToCart(args.product_id);
      }
    } catch (error) {
      output = `that did not work: ${String(error)}`;
    }

    send({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: call.call_id, output }
    });
    requestResponse();
  }

  pc.addTrack(mic.getTracks()[0], mic);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  if (pc.iceGatheringState !== "complete") {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1500);
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  const answer = await fetch("/session?shopper=1", {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: pc.localDescription?.sdp || offer.sdp
  });
  if (!answer.ok) {
    close();
    throw new Error(await answer.text());
  }
  await pc.setRemoteDescription({ type: "answer", sdp: await answer.text() });

  return {
    send(text: string) {
      send({
        type: "conversation.item.create",
        item: { type: "message", role: "user", content: [{ type: "input_text", text }] }
      });
      requestResponse();
    },
    close
  };
}

function functionCall(
  msg: Record<string, unknown>
): { call_id: string; name: string; arguments: string } | null {
  if (msg.type === "response.function_call_arguments.done" && msg.call_id) {
    return {
      call_id: String(msg.call_id),
      name: String(msg.name || ""),
      arguments: String(msg.arguments || "{}")
    };
  }
  const item = (msg.item || msg) as Record<string, unknown>;
  if (item && item.type === "function_call" && item.call_id) {
    return {
      call_id: String(item.call_id),
      name: String(item.name || ""),
      arguments: String(item.arguments || "{}")
    };
  }
  return null;
}
