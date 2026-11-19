/**
 * Asistente con recuperación (RAG) sobre documentos aprobados y Ollama local.
 * Si Ollama no está disponible, el flujo degrada a búsqueda documental sin IA.
 */
import type { ChatSource } from "./constants";
import { detectTopics, excerpt, queryTerms, searchChunks, type Hit, type Topic } from "./search";

export const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3.5:4b";

export type OllamaStatus = { available: boolean; model: string | null; reason?: string };

export async function ollamaStatus(): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { available: false, model: null, reason: "Ollama respondió con un error." };
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = (data.models || []).map((m) => m.name);
    if (!names.length) {
      return { available: false, model: null, reason: "Ollama no tiene modelos instalados." };
    }
    const model =
      names.find((n) => n === OLLAMA_MODEL) ||
      names.find((n) => n.startsWith(OLLAMA_MODEL.split(":")[0])) ||
      names.find((n) => !/embed/i.test(n)) ||
      null;
    return model
      ? { available: true, model }
      : { available: false, model: null, reason: "No hay un modelo de conversación instalado." };
  } catch {
    return { available: false, model: null, reason: "Ollama no está en ejecución en este equipo." };
  }
}

/** Contexto que la persona decide compartir al iniciar el chat. */
export type AskerProfile = { group: string; community: string; territory: string };

export type Retrieval = { topics: Topic[]; hits: Hit[]; sources: ChatSource[] };

export function retrieve(
  message: string,
  previousUserMessage = "",
  profile?: AskerProfile,
): Retrieval {
  // Las preguntas de seguimiento cortas ("¿y quién la hace?") heredan el tema anterior.
  const short = queryTerms(message).length < 3;
  const query = short && previousUserMessage ? `${previousUserMessage} ${message}` : message;
  const topics = detectTopics(query);
  const hits = searchChunks(query, {
    topicIds: topics.map((t) => t.id),
    limit: 6,
    // Los apartados que mencionan a su pueblo o territorio ganan prioridad, sin excluir los demás.
    boostText: profile ? profile.community + " " + profile.territory : "",
  });
  const sources: ChatSource[] = hits.map((h, i) => ({
    n: i + 1,
    documentId: h.documentId,
    chunkId: h.chunkId,
    title: h.title,
    entity: h.entity,
    docType: h.docType,
    docDate: h.docDate,
    heading: h.heading || `Fragmento ${h.ord + 1}`,
    excerpt: excerpt(h.content, query),
    officialUrl: h.officialUrl,
  }));
  return { topics, hits, sources };
}

const SYSTEM_PROMPT = `Eres RAIZIA, un asistente de orientación jurídica para comunidades y personas en Colombia. Hablas con respeto, calidez y palabras sencillas, como quien explica a un vecino.

Reglas obligatorias:
1. Responde ÚNICAMENTE con la información de las FUENTES numeradas que recibes. No uses conocimiento externo.
2. Cada dato jurídico debe llevar la cita de su fuente entre corchetes, por ejemplo [1] o [2]. Cita solo números de fuentes que existan.
3. Nunca inventes normas, artículos, sentencias, fechas, plazos ni entidades. Solo menciona los que aparezcan escritos en las fuentes.
4. Si las fuentes no bastan para responder, dilo con claridad y explica solo lo que sí dicen.
5. Formato: empieza con una respuesta directa de dos o tres frases. Después, si ayuda, una lista corta con los puntos clave. Termina con "Qué puedes hacer" solo si las fuentes indican pasos concretos.
6. Sé breve (máximo 160 palabras). No repitas la pregunta ni copies párrafos largos.
7. Es orientación general, no asesoría legal definitiva.
8. Las sentencias resuelven casos concretos: preséntalas como "en un caso parecido, la Corte decidió…". No asegures que el caso de la persona se resolverá igual ni califiques como ilegal la conducta de nadie.`;

export type ConversationKind = "charla" | "sin_fuentes";

const SMALL_TALK =
  /^[¡¿\s]*(?:hola+|buen[oa]s(?:\s+(?:d[ií]as|tardes|noches))?|saludos|hey|qu[eé] tal|c[oó]mo est[aá]s?|(?:muchas\s+)?gracias|ok(?:ay)?|vale|listo|de acuerdo|entiendo|perfecto|adi[oó]s|chao|hasta luego|qui[eé]n eres|qu[eé] eres|qu[eé] (?:puedes|sabes) hacer|c[oó]mo funcionas?|para qu[eé] sirves|c[oó]mo me (?:puedes )?ayudas?|ayuda|necesito ayuda|tengo una (?:duda|pregunta|consulta))\b/i;

/** Saludos, agradecimientos y preguntas sobre el propio asistente: no requieren buscar documentos. */
export function isSmallTalk(message: string): boolean {
  return SMALL_TALK.test(message.trim()) && queryTerms(message).length <= 2 && message.length < 90;
}

/** Respuesta fija para saludar cuando la IA local no está disponible. */
export const STATIC_GREETING =
  "Hola. Soy RAIZIA. En este momento la inteligencia artificial local no está disponible, pero puedo buscar en la biblioteca de documentos oficiales: cuéntame tu situación y te muestro los apartados relacionados.";

const CONVERSATION_PROMPT = `Eres RAIZIA, un asistente de orientación jurídica para comunidades y personas en Colombia. Hablas con respeto, calidez y palabras sencillas.

En este turno NO tienes documentos de respaldo, así que solo conversas. Reglas obligatorias:
1. Responde breve (máximo 70 palabras) y de forma natural, como en una conversación.
2. No des información jurídica: no menciones leyes, artículos, sentencias, plazos, trámites ni entidades competentes. No inventes nada.
3. Si la persona saluda o agradece, responde con amabilidad e invítala a contar su situación.
4. Si pregunta quién eres o qué haces: explica que buscas en documentos oficiales colombianos ya revisados (leyes, decretos y sentencias) y respondes con palabras sencillas citando la fuente; que también hay una biblioteca para leer los documentos y herramientas para preparar escritos como el derecho de petición o la tutela.
5. Si dice que necesita ayuda sin dar detalles, hazle una o dos preguntas concretas: qué pasó, quién está involucrado, dónde y cuándo.`;

const NO_SOURCES_RULE = `
6. La persona hizo una consulta, pero en la biblioteca no hay documentos aprobados que la respalden. Díselo con claridad y sin rodeos, NO intentes responder el fondo, y hazle una o dos preguntas concretas para entender mejor su situación o sugiérele contarla con otras palabras.`;

function buildConversation(
  message: string,
  history: { role: "user" | "assistant"; content: string }[],
  kind: ConversationKind,
  profile?: AskerProfile,
) {
  const past = history.slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 500) }));
  return [
    { role: "system", content: CONVERSATION_PROMPT + (kind === "sin_fuentes" ? NO_SOURCES_RULE : "") },
    ...past,
    { role: "user", content: describeAsker(profile).replace(/ Ten en cuenta[^\n]*/, "") + message },
  ];
}

function describeAsker(profile?: AskerProfile): string {
  if (!profile?.group) return "";
  const parts = [profile.group];
  if (profile.community) parts.push("pueblo o comunidad: " + profile.community);
  if (profile.territory) parts.push("territorio: " + profile.territory);
  return (
    "QUIÉN CONSULTA (dato que la persona compartió): " +
    parts.join("; ") +
    ". Ten en cuenta este contexto al explicar, pero no afirmes sobre su pueblo o territorio nada que no esté en las fuentes.\n\n"
  );
}

function buildMessages(
  message: string,
  hits: Hit[],
  history: { role: "user" | "assistant"; content: string }[],
  profile?: AskerProfile,
) {
  const context = hits
    .map((h, i) => {
      const where = [h.title, h.heading].filter(Boolean).join(" — ");
      return `[${i + 1}] ${where}\n${h.content.slice(0, 950)}`;
    })
    .join("\n\n");
  const past = history.slice(-4).map((m) => ({
    role: m.role,
    content: m.content.slice(0, 600),
  }));
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...past,
    {
      role: "user",
      content: `${describeAsker(profile)}FUENTES:\n${context}\n\nPREGUNTA: ${message}\n\nResponde en español sencillo, citando las fuentes con [número].`,
    },
  ];
}

/** Genera la respuesta en streaming. Emite fragmentos de texto ya limpios. */
export async function* generateAnswer(
  model: string,
  message: string,
  hits: Hit[],
  history: { role: "user" | "assistant"; content: string }[],
  signal?: AbortSignal,
  profile?: AskerProfile,
  conversation?: ConversationKind,
): AsyncGenerator<string> {
  const body = {
    model,
    messages: conversation
      ? buildConversation(message, history, conversation, profile)
      : buildMessages(message, hits, history, profile),
    stream: true,
    think: false,
    keep_alive: "15m",
    options: conversation
      ? { temperature: 0.4, top_p: 0.9, num_ctx: 4096, num_predict: 220 }
      : { temperature: 0.2, top_p: 0.9, num_ctx: 4096, num_predict: 420 },
  };
  let res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 400) {
    // Modelos sin modo de razonamiento rechazan el parámetro "think".
    const { think: _omit, ...rest } = body;
    void _omit;
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rest),
      signal,
    });
  }
  if (!res.ok || !res.body) {
    throw new Error(`Ollama respondió con el código ${res.status}.`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let inThink = false;
  let carry = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, nl).trim();
      pending = pending.slice(nl + 1);
      if (!line) continue;
      let json: { message?: { content?: string }; error?: string; done?: boolean };
      try {
        json = JSON.parse(line);
      } catch {
        continue;
      }
      if (json.error) throw new Error(json.error);
      let text = carry + (json.message?.content || "");
      carry = "";
      // Descarta bloques <think>…</think> si el modelo los emite dentro del contenido.
      let out = "";
      while (text) {
        if (inThink) {
          const end = text.indexOf("</think>");
          if (end < 0) {
            text = "";
          } else {
            inThink = false;
            text = text.slice(end + 8).replace(/^\s+/, "");
          }
        } else {
          const start = text.indexOf("<think>");
          if (start >= 0) {
            out += text.slice(0, start);
            inThink = true;
            text = text.slice(start + 7);
          } else {
            const partial = text.lastIndexOf("<");
            if (partial >= 0 && "<think>".startsWith(text.slice(partial))) {
              out += text.slice(0, partial);
              carry = text.slice(partial);
            } else {
              out += text;
            }
            text = "";
          }
        }
      }
      if (out) yield out;
    }
  }
  if (carry) yield carry;
}

const ORGANIZE_PROMPTS = {
  hechos: `Ordenas relatos para documentos jurídicos en Colombia. La persona puede escribir con errores o mezclar ideas porque el español no es su primera lengua.

Tarea: reescribe SU relato como una lista de hechos, uno por línea, en español claro y respetuoso, en primera persona y en orden de tiempo cuando sea posible.

Reglas obligatorias:
1. No agregues ningún hecho, fecha, nombre, lugar, cifra, norma ni conclusión que la persona no haya dicho.
2. No quites información que la persona dio.
3. Si algo no se entiende, déjalo con sus mismas palabras.
4. No des consejos, opiniones ni explicaciones.
5. Devuelve solo la lista: una línea por hecho, sin numeración, sin título y sin texto adicional.`,
  peticiones: `Ordenas solicitudes para documentos jurídicos en Colombia. La persona puede escribir con errores porque el español no es su primera lengua.

Tarea: reescribe lo que la persona pide como una lista de solicitudes concretas, una por línea, en español claro y respetuoso. Cada línea empieza con "Que".

Reglas obligatorias:
1. No agregues solicitudes, fechas, nombres, cifras ni normas que la persona no haya dicho.
2. No quites nada de lo que pidió.
3. Si algo no se entiende, déjalo con sus mismas palabras.
4. No des consejos ni explicaciones.
5. Devuelve solo la lista: una línea por solicitud, sin numeración, sin título y sin texto adicional.`,
};

/** Reescribe el relato en líneas claras. Devuelve "" si el resultado no es confiable. */
export async function organizeNarrative(
  model: string,
  text: string,
  kind: "hechos" | "peticiones",
  signal?: AbortSignal,
): Promise<string> {
  const body = {
    model,
    stream: false,
    think: false,
    keep_alive: "15m",
    options: { temperature: 0.1, num_ctx: 4096, num_predict: 700 },
    messages: [
      { role: "system", content: ORGANIZE_PROMPTS[kind] },
      { role: "user", content: text },
    ],
  };
  const call = (payload: object) =>
    fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  let res = await call(body);
  if (res.status === 400) {
    const { think: _omit, ...rest } = body;
    void _omit;
    res = await call(rest);
  }
  if (!res.ok) return "";
  const json = (await res.json()) as { message?: { content?: string } };
  const lines = (json.message?.content || "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .split(/\r?\n+/)
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean);
  const out = lines.join("\n");
  // Si el modelo se extendió mucho más que el relato original, pudo haber añadido contenido: se descarta.
  if (!out || out.length > text.length * 2 + 200) return "";
  return out;
}

const PROBE_PROMPTS = {
  hechos: `Lees el relato de una persona que prepara un escrito para una entidad o un juez en Colombia. El español puede no ser su primera lengua.

Decide si falta información importante para entender el caso: cuándo ocurrió, dónde ocurrió, quién lo hizo o qué respuesta recibió.
- Si falta, escribe como máximo 2 preguntas cortas y muy sencillas, una por línea, para pedir SOLO lo que falta.
- No preguntes lo que ya dijo. No des consejos ni explicaciones.
- Si no falta nada importante, responde exactamente: COMPLETO`,
  peticiones: `Lees lo que una persona quiere pedir en un escrito para una entidad o un juez en Colombia. El español puede no ser su primera lengua.

Decide si queda claro qué quiere exactamente que hagan, entreguen o respondan.
- Si no queda claro, escribe como máximo 2 preguntas cortas y muy sencillas, una por línea, para aclararlo.
- No preguntes lo que ya dijo. No des consejos ni sugieras qué pedir.
- Si está claro, responde exactamente: COMPLETO`,
};

/** Preguntas de seguimiento (0 a 2) para completar el relato antes de redactarlo. */
export async function probeNarrative(
  model: string,
  text: string,
  kind: "hechos" | "peticiones",
  signal?: AbortSignal,
): Promise<string[]> {
  const body = {
    model,
    stream: false,
    think: false,
    keep_alive: "15m",
    options: { temperature: 0.1, num_ctx: 4096, num_predict: 120 },
    messages: [
      { role: "system", content: PROBE_PROMPTS[kind] },
      { role: "user", content: text },
    ],
  };
  const call = (payload: object) =>
    fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  let res = await call(body);
  if (res.status === 400) {
    const { think: _omit, ...rest } = body;
    void _omit;
    res = await call(rest);
  }
  if (!res.ok) return [];
  const json = (await res.json()) as { message?: { content?: string } };
  const content = (json.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "");
  if (/^\s*COMPLETO/i.test(content)) return [];
  return content
    .split(/\r?\n+|(?<=\?)\s+(?=¿)/)
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim())
    .filter((l) => l.endsWith("?") && l.length < 160)
    .filter((q) => !alreadyAnswered(q, text))
    .slice(0, 2);
}

/** Descarta preguntas sobre algo que el relato ya dice (el modelo pequeño tiende a repetirlas). */
function alreadyAnswered(question: string, text: string): boolean {
  const months = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre";
  const checks: [RegExp, RegExp][] = [
    [
      /cu[aá]ndo|fecha/i,
      new RegExp(`\\b(?:19|20)\\d{2}\\b|\\b(?:${months})\\b|hace\\s+\\S+\\s+(?:d[ií]as?|semanas?|mes(?:es)?|a[nñ]os?)|\\bayer\\b`, "i"),
    ],
    [/d[oó]nde|lugar/i, /vereda|municipio|resguardo|barrio|corregimiento|territorio|comunidad de/i],
    [/respuesta|respond|contest/i, /respond|contest|dijeron|dijo que|negaron|rechaz/i],
    [/qui[eé]n/i, /empresa|alcald|entidad|gobernaci|funcionari|eps\b|hospital|m[aá]quina|se[nñ]or/i],
  ];
  return checks.some(([about, present]) => about.test(question) && present.test(text));
}

/** Pregunta breve a la IA local con una sola respuesta (sin streaming). */
export async function askOnce(
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  signal?: AbortSignal,
): Promise<string> {
  const body = {
    model,
    stream: false,
    think: false,
    keep_alive: "15m",
    options: { temperature: 0, num_ctx: 4096, num_predict: maxTokens },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  const call = (payload: object) =>
    fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  let res = await call(body);
  if (res.status === 400) {
    const { think: _omit, ...rest } = body;
    void _omit;
    res = await call(rest);
  }
  if (!res.ok) return "";
  const json = (await res.json()) as { message?: { content?: string } };
  return (json.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
