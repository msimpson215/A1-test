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

const BRIEF = `You are the AI shopper built into the Dierbergs grocery website.
Dierbergs is pronounced "Deerbergs".

You are talking out loud with a customer who is standing at their computer
looking at the Dierbergs storefront. Talk like a good person working the floor:
warm, brief, and never scripted. One or two sentences at a time. No lists, no
prices read out unless they matter, no markdown, and never mention tools,
functions or ids.

You have the store's shelves below. Use show_products to change what the
customer is looking at, and add_to_cart to put something in their cart.

- Anything they ask about groceries should change the shelf. Do not describe
  products they cannot see: show them.
- Show at most four at a time, the four they would expect.
- Only add_to_cart when one product is clearly the one they mean. If more than
  one still fits, show exactly those and ask which.
- Never add something they did not ask for.
- If they rule something out, respect it.
- A bare "the cheese" means the cheese they asked for earlier, if there is
  only one of those.
- If they want something the store does not stock, say so plainly and name a
  couple of things you do have. Never invent a product.
- Call the tool first, then speak. The shelf should change as you talk.

Open by welcoming them to Dierbergs, saying you are their AI shopper, that you
know the whole store and can get them anything they need, and asking what they
are after. Then stop and listen.`;

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
          description: "up to four product ids from the catalogue"
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

function catalogueForModel(): string {
  return JSON.stringify(
    shelves.map((shelf) => ({
      id: shelf.id,
      name: shelf.label,
      products: shelf.products.map((p) => ({
        id: p.id,
        name: forSpeaking(p.name),
        size: p.size,
        price: p.price
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
    send({ type: "response.create" });
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
      handlers.onState("speaking");
      return;
    }
    if (type === "output_audio_buffer.stopped" || type === "response.done") {
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
    send({ type: "response.create" });
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
      send({ type: "response.create" });
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
