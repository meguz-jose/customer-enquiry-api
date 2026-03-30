const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.json());

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const sessions = {};

const SYSTEM_PROMPT = `You are a friendly customer support assistant for an e-commerce store. Collect the customer's full name, email address, order number, type of enquiry, and a brief description of their issue. Ask naturally, one or two questions at a time. Once you have everything, summarize and end with exactly:
ENQUIRY_COMPLETE: {"name":"...","email":"...","order_number":"...","enquiry_type":"...","description":"..."}`;

app.post("/enquiry/start", (req, res) => {
  const sessionId = `session_${Date.now()}`;
  sessions[sessionId] = { messages: [] };
  res.json({ sessionId, message: "Hi! Welcome to our support team. Could you start by telling me your full name?" });
});

app.post("/enquiry/message", async (req, res) => {
  const { sessionId, message } = req.body;
  if (!sessionId || !message) return res.status(400).json({ error: "sessionId and message are required." });
  const session = sessions[sessionId];
  if (!session) return res.status(404).json({ error: "Session not found." });
  session.messages.push({ role: "user", content: message });
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: session.messages,
    });
    const assistantMessage = response.content[0].text;
    session.messages.push({ role: "assistant", content: assistantMessage });
    const match = assistantMessage.match(/ENQUIRY_COMPLETE:\s*(\{.*\})/s);
    if (match) {
      const customerData = JSON.parse(match[1]);
      const cleanMessage = assistantMessage.replace(/ENQUIRY_COMPLETE:.*$/s, "").trim();
      return res.json({ message: cleanMessage, complete: true, customerData });
    }
    res.json({ message: assistantMessage, complete: false });
  } catch (error) {
    res.status(500).json({ error: "Something went wrong." });
  }
});

app.get("/enquiry/sessions", (req, res) => {
  const completed = Object.entries(sessions)
    .filter(([, s]) => s.customerData)
    .map(([id, s]) => ({ sessionId: id, customerData: s.customerData }));
  res.json({ total: completed.length, enquiries: completed });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server
