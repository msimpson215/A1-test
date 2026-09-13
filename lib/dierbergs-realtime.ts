import { shelves, specialFor, specialPriceFor } from "@/data/dierbergs-catalogue";
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
  /** Put a product in the cart, resolving once it has landed there. */
  addToCart(productId: string, quantity?: number): Promise<string>;
  /** Take a product back out of the cart. */
  removeFromCart(productId: string): string;
  /** Swap one product for another, so a change of mind leaves one, not two. */
  replaceInCart(outProductId: string, inProductId: string): Promise<string>;
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

const BRIEF = `You are Axon. You are helping this person shop on the Dierbergs grocery website.
Dierbergs is pronounced "Deerbergs".

Talk the way you talk everywhere else: a real conversation, not a script and
not a kiosk. Warm, brief, one or two sentences. No lists, no markdown, never
mention tools, functions or ids. Never call yourself a chatbot or an AI
shopper. The button on the page is "Your AI Shopper"; do not introduce
yourself with that line.

Open with: "Welcome to Dierbergs. How can I help you with your shopping
today?" Then stop and listen.

Your hands: show_products puts products on the shelf they can see. add_to_cart
puts one in the cart. remove_from_cart takes one back out. replace_in_cart
swaps one for another in a single move. Use them. Do not describe products
they cannot see — show them. Call the tool first, then speak.

You are not waiting on a web page and you cannot see one. Your hands work the
instant you use them and they tell you what happened. So never say a shelf is
loading, that something is still in progress, that you cannot see the screen
yet, or that a refresh would help. A refresh would throw away their whole
cart. If a hand ever comes back with a problem, say plainly what did not work
and offer to try it again.

The shelves you have are below. Only those products exist. Never invent a
product, a price, or a size this store does not sell. There is no Dierbergs
quart.

One product in each aisle is on this week's ad. It is the only one with a
"deal" on it, which is its sale price, and "dealThrough", which is the day it
ends. If they ask whether there is a special, say what it is, what it costs,
what it was, and when it ends, then offer it. Nothing without a "deal" is on
special, however good the price looks. If they say yes to a special, add that
product.

If they ask for more than one of something, add it that many times with the
quantity. If they ask for two different things, do both.

Changing their mind is normal, and it is the whole job. Listen for the
difference between three things:
"Make it the gallon instead", "no, I wanted the half gallon", "replace that
with the chocolate" — one thought. Use replace_in_cart, so they end up with
one carton, not two.
"Actually, just add chocolate milk too" — that is a second thought. Add it and
leave what is already there alone.
"Take that back out", "never mind the milk" — remove_from_cart.
When it is ambiguous, the cart is the truth: say what is in it now and ask
which way they want it. Never leave two cartons in there because they said two
sizes.

"That one", "the other one", "the cheaper one" refer to what is on the shelf.
They should never have to say a full name twice. Wait until they have finished
speaking; a sentence that starts "no" usually has the real answer at the end
of it.

If they turn around three or four times on the same item, stop moving it and
wait: say you want to get it right, name the two they are between, and let
them pick. Friendly, not scolding, and no more swapping until they answer.

Milk, in particular. You know this aisle cold:
Fat runs whole, 2%, 1%, skim — and skim, fat free and nonfat all mean the same
carton. Dierbergs' own comes in gallon and half gallon; the store brand is the
cheapest milk in the case. There is no Dierbergs quart.
Lactose. If they say they are lactose intolerant, or that milk bothers them,
say you are not a doctor and then be useful: Lactaid and Prairie Farms Lactose
Free are regular milk with the lactose already broken down, so they taste like
milk; fairlife is ultra filtered, lactose free, with more protein and less
sugar. a2 is different — it is not lactose free, it is milk from cows whose
protein is only the a2 kind, which some people say sits easier. Say which is
which, show a few, and let them choose. Never promise how their body will
react and never tell them to take anything.
Chocolate milk is Dierbergs 1% chocolate, in the half gallon.
Organic is Horizon. If they want a brand this store does not carry, say so.

If they ask for something this store does not carry, say so. Never invent.`;

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
          description: "product ids from the catalogue, in the order they should appear"
        }
      },
      required: ["aisle", "product_ids"]
    }
  },
  {
    type: "function",
    name: "add_to_cart",
    description: "Put a product into the customer's cart. It flies into the cart on screen.",
    parameters: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "id of the product to add" },
        quantity: {
          type: "integer",
          description: "how many of it they asked for; leave out for one"
        }
      },
      required: ["product_id"]
    }
  },
  {
    type: "function",
    name: "remove_from_cart",
    description: "Take a product back out of the customer's cart.",
    parameters: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "id of the product to take out" }
      },
      required: ["product_id"]
    }
  },
  {
    type: "function",
    name: "replace_in_cart",
    description:
      "Swap one product in the cart for another in a single move. Use this when they change their mind about size, kind or brand, so they are not left with both.",
    parameters: {
      type: "object",
      properties: {
        out_product_id: { type: "string", description: "id of the product to take out" },
        in_product_id: { type: "string", description: "id of the product to put in instead" }
      },
      required: ["out_product_id", "in_product_id"]
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
    shelves.map((shelf) => {
      const ad = specialFor(shelf.id);
      return {
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
          // Set on the one product on this week's ad, and on nothing else.
          deal: specialPriceFor(p.id) ?? undefined,
          dealThrough: specialPriceFor(p.id) ? ad?.special.through : undefined,
          diet: p.dietary?.length ? p.dietary : undefined
        }))
      };
    })
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
  /** Did the response that is running say anything out loud? */
  let spoke = false;
  /** A tool has delivered its result and nobody has spoken about it yet. */
  let toolUnspoken = false;
  /** Tool calls still running. Adding to the cart takes a second to land. */
  let toolsRunning = 0;
  /** Tool calls run one after another, never on top of each other. */
  let toolChain: Promise<void> = Promise.resolve();

  const requestResponse = () => {
    if (responding) {
      queued = true;
      return;
    }
    responding = true;
    spoke = false;
    send({ type: "response.create" });
  };

  /*
   * Whether to ask for a sentence about what a tool just did.
   *
   * Only when the turn that called it said nothing. A model that calls
   * add_to_cart and says "okay, that's in your cart" in the same breath has
   * already told them; asking again is what put two confirmations on top of
   * each other, one voice over the other. Wait for the response and the tool
   * both to finish before deciding, because either can land first.
   */
  const speakAboutToolIfSilent = () => {
    if (responding || toolsRunning > 0 || !toolUnspoken) return;
    toolUnspoken = false;
    if (spoke) return;
    requestResponse();
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
      spoke = false;
      handlers.onState("speaking");
      return;
    }
    if (type === "response.done") {
      responding = false;
      handlers.onState("listening");
      if (queued) {
        queued = false;
        requestResponse();
        return;
      }
      speakAboutToolIfSilent();
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
      spoke = true;
      handlers.onSaid(String(msg.transcript));
      return;
    }
    if (type === "error") {
      const detail = msg.error as { message?: string } | undefined;
      handlers.onError(detail?.message || "The line dropped.");
      return;
    }

    const call = functionCall(msg);
    if (!call) return;
    toolsRunning += 1;
    try {
      /*
       * Cart moves go one at a time. Two products asked for in one breath
       * arrive as two calls at once, and each one flies a package into the
       * cart off a single slot — run them together and the second is dropped,
       * which is why asking for two things only ever bought one.
       *
       * Putting products on a shelf is not a cart move: it is instant, and it
       * waits for nothing. It used to sit in the same line, so a shelf change
       * asked for while a package was still in the air did not happen and did
       * not answer. That silence is what had the assistant telling the shopper
       * the page was still loading and offering a refresh.
       */
      if (call.name === "show_products") {
        await runTool(call);
      } else {
        const mine = toolChain.then(() => runTool(call));
        // A failure ends here rather than poisoning the line behind it.
        toolChain = mine.catch(() => {});
        await mine;
      }
    } finally {
      toolsRunning -= 1;
    }
    speakAboutToolIfSilent();
  }

  async function runTool(call: { call_id: string; name: string; arguments: string }) {
    let args: {
      aisle?: string;
      product_ids?: string[];
      product_id?: string;
      quantity?: number;
      out_product_id?: string;
      in_product_id?: string;
    } = {};
    try {
      args = JSON.parse(call.arguments || "{}");
    } catch { /* the model sent something odd; treat as empty */ }

    let output = "done";
    try {
      if (call.name === "show_products") {
        output = tools.showProducts(args.aisle || "", args.product_ids || []);
      } else if (call.name === "add_to_cart" && args.product_id) {
        output = await tools.addToCart(args.product_id, args.quantity);
      } else if (call.name === "remove_from_cart" && args.product_id) {
        output = tools.removeFromCart(args.product_id);
      } else if (call.name === "replace_in_cart" && args.in_product_id) {
        output = await tools.replaceInCart(args.out_product_id || "", args.in_product_id);
      }
    } catch (error) {
      output = `that did not work: ${String(error)}`;
    }

    send({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: call.call_id, output }
    });
    toolUnspoken = true;
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
