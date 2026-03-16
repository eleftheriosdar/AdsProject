import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are an expert PPC (Pay-Per-Click) optimisation specialist AI agent. You have deep knowledge of Google Ads, Microsoft Ads, and digital advertising strategy.

Your role is to:
1. Analyse PPC campaign data and identify optimisation opportunities
2. Provide specific, actionable recommendations for improving campaign performance
3. Help with keyword research, bid strategy, ad copy improvements, and quality score optimisation
4. Interpret metrics like CTR, CPC, ROAS, conversion rate, impression share, and quality score
5. Suggest budget allocation strategies and audience targeting improvements
6. Identify negative keyword opportunities and search term analysis
7. Advise on ad extensions (sitelinks, callouts, structured snippets, etc.)

When analysing campaign data:
- Always prioritise recommendations by potential impact
- Be specific with numbers and percentages where possible
- Explain the reasoning behind each recommendation
- Flag any urgent issues (e.g. wasted spend, disapproved ads, budget issues)
- Consider seasonality and industry benchmarks

When you don't have real campaign data, ask clarifying questions or work with the data the user provides.

Format your responses clearly with:
- A brief summary of findings
- Numbered recommendations in priority order
- Estimated impact where possible
- Next steps

You can analyse CSV data, metrics tables, or verbal descriptions of campaign performance.`;

const QUICK_ACTIONS = [
  { label: "Analyse campaign performance", prompt: "I want to analyse my Google Ads campaign performance. Here are my key metrics: CTR 2.1%, Avg CPC £1.45, Conversion Rate 3.2%, ROAS 280%, Impression Share 42%. What optimisations do you recommend?" },
  { label: "Review keyword bids", prompt: "Help me review my keyword bidding strategy. I have a mix of exact, phrase and broad match keywords. Some high-volume keywords have low quality scores (4-5). What should I do?" },
  { label: "Improve Quality Scores", prompt: "My average quality score is 5/10. What are the most impactful changes I can make to improve quality scores across my account?" },
  { label: "Reduce wasted spend", prompt: "I think I have significant wasted spend in my account. What are the key areas to audit and what negative keywords should I consider for an e-commerce brand?" },
  { label: "Ad copy optimisation", prompt: "I want to improve my ad copy. What are the best practices for responsive search ads in 2024 and how can I maximise ad strength?" },
  { label: "Budget allocation", prompt: "I have £5,000/month to allocate across 4 campaigns: Brand, Generic, Competitor, and Remarketing. How should I distribute budget for maximum ROAS?" },
];

const SAMPLE_CAMPAIGNS = [
  { name: "Brand - Exact", budget: 800, spend: 720, clicks: 1840, conversions: 89, cpc: 0.39, ctr: 8.2, roas: 420, qs: 9 },
  { name: "Generic - Mixed", budget: 2000, spend: 1980, clicks: 890, conversions: 31, cpc: 2.22, ctr: 1.8, roas: 180, qs: 5 },
  { name: "Competitor", budget: 600, spend: 598, clicks: 310, conversions: 8, cpc: 1.93, ctr: 2.1, roas: 120, qs: 6 },
  { name: "Remarketing", budget: 400, spend: 287, clicks: 620, conversions: 44, cpc: 0.46, ctr: 4.7, roas: 680, qs: 8 },
];

function MetricBadge({ value, threshold, format = "num", label }) {
  const num = parseFloat(value);
  let color = "#059669";
  if (format === "cpc" && num > threshold) color = "#dc2626";
  else if (format === "qs" && num < threshold) color = "#dc2626";
  else if (format === "qs" && num >= threshold) color = "#059669";
  else if (format === "roas" && num < threshold) color = "#dc2626";
  else if (format === "ctr" && num < threshold) color = "#f59e0b";
  return (
    <span style={{ color, fontWeight: 600, fontSize: 13 }}>
      {format === "cpc" ? `£${num.toFixed(2)}` : format === "roas" ? `${num}%` : format === "qs" ? `${num}/10` : `${num}%`}
    </span>
  );
}

function CampaignTable({ onAnalyse }) {
  return (
    <div style={{ background: "var(--color-background-secondary)", borderRadius: 12, padding: "16px", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <p style={{ margin: 0, fontWeight: 500, fontSize: 14, color: "var(--color-text-primary)" }}>📊 Sample Campaign Data</p>
        <button
          onClick={() => onAnalyse("Analyse these campaign metrics and give me your top 5 priority optimisations:\n\n" + SAMPLE_CAMPAIGNS.map(c => `${c.name}: Budget £${c.budget}, Spend £${c.spend}, CTR ${c.ctr}%, CPC £${c.cpc.toFixed(2)}, Conversions ${c.conversions}, ROAS ${c.roas}%, QS ${c.qs}/10`).join("\n"))}
          style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer" }}
        >
          Analyse with AI ↗
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
              {["Campaign", "Budget", "Spend", "CTR", "CPC", "Conv.", "ROAS", "QS"].map(h => (
                <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "var(--color-text-secondary)", fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SAMPLE_CAMPAIGNS.map((c, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                <td style={{ padding: "8px 8px", fontWeight: 500, color: "var(--color-text-primary)", fontSize: 12 }}>{c.name}</td>
                <td style={{ padding: "8px 8px", color: "var(--color-text-secondary)" }}>£{c.budget}</td>
                <td style={{ padding: "8px 8px", color: c.spend / c.budget > 0.95 ? "#dc2626" : "var(--color-text-secondary)" }}>£{c.spend}</td>
                <td style={{ padding: "8px 8px" }}><MetricBadge value={c.ctr} threshold={2} format="ctr" /></td>
                <td style={{ padding: "8px 8px" }}><MetricBadge value={c.cpc} threshold={2} format="cpc" /></td>
                <td style={{ padding: "8px 8px", color: "var(--color-text-primary)" }}>{c.conversions}</td>
                <td style={{ padding: "8px 8px" }}><MetricBadge value={c.roas} threshold={200} format="roas" /></td>
                <td style={{ padding: "8px 8px" }}><MetricBadge value={c.qs} threshold={7} format="qs" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 20, flexDirection: isUser ? "row-reverse" : "row" }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        background: isUser ? "#1a1a2e" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 600, color: "#fff"
      }}>
        {isUser ? "U" : "AI"}
      </div>
      <div style={{
        maxWidth: "80%",
        background: isUser ? "#1a1a2e" : "var(--color-background-secondary)",
        color: isUser ? "#fff" : "var(--color-text-primary)",
        borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
        padding: "12px 16px",
        fontSize: 14,
        lineHeight: 1.6,
      }}>
        {msg.role === "assistant" ? (
          <div style={{ whiteSpace: "pre-wrap" }}
            dangerouslySetInnerHTML={{
              __html: msg.content
                .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                .replace(/^### (.*)/gm, "<h4 style='margin:12px 0 6px;font-size:14px;font-weight:600'>$1</h4>")
                .replace(/^## (.*)/gm, "<h3 style='margin:14px 0 8px;font-size:15px;font-weight:600'>$1</h3>")
                .replace(/^- (.*)/gm, "• $1")
                .replace(/^\d+\. /gm, (m) => m)
            }}
          />
        ) : (
          <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
        )}
      </div>
    </div>
  );
}

export default function PPCAgent() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCampaigns, setShowCampaigns] = useState(true);
  const [activeTab, setActiveTab] = useState("chat");
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text) {
    const userMsg = text || input.trim();
    if (!userMsg || loading) return;
    setInput("");
    setShowCampaigns(false);

    const newMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();
      const reply = data.content?.find(b => b.type === "text")?.text || "Sorry, I couldn't generate a response.";
      setMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch (err) {
      setMessages([...newMessages, { role: "assistant", content: "Error connecting to AI. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const totalSpend = SAMPLE_CAMPAIGNS.reduce((s, c) => s + c.spend, 0);
  const totalConv = SAMPLE_CAMPAIGNS.reduce((s, c) => s + c.conversions, 0);
  const avgRoas = Math.round(SAMPLE_CAMPAIGNS.reduce((s, c) => s + c.roas, 0) / SAMPLE_CAMPAIGNS.length);

  return (
    <div style={{ fontFamily: "var(--font-sans)", maxWidth: 860, margin: "0 auto", padding: "0 0 24px" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
        borderRadius: "0 0 16px 16px",
        padding: "20px 24px",
        marginBottom: 20,
        color: "#fff"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⚡</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>PPC Optimisation Agent</h1>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>Powered by Claude AI · Google Ads Integration</p>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <div style={{ background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 20, padding: "4px 10px", fontSize: 11, color: "#6ee7b7" }}>● Live</div>
          </div>
        </div>
        {/* KPI Strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 16 }}>
          {[
            { label: "Total Spend", value: `£${totalSpend.toLocaleString()}`, sub: "This month" },
            { label: "Conversions", value: totalConv, sub: "All campaigns" },
            { label: "Avg ROAS", value: `${avgRoas}%`, sub: "Blended" },
            { label: "Campaigns", value: SAMPLE_CAMPAIGNS.length, sub: "Active" },
          ].map((k, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "10px 12px" }}>
              <p style={{ margin: 0, fontSize: 11, opacity: 0.6 }}>{k.label}</p>
              <p style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 600 }}>{k.value}</p>
              <p style={{ margin: 0, fontSize: 10, opacity: 0.5 }}>{k.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 4px", marginBottom: 16 }}>
        {["chat", "campaigns", "actions"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: "7px 16px", borderRadius: 8, border: "1px solid",
            borderColor: activeTab === tab ? "transparent" : "var(--color-border-tertiary)",
            background: activeTab === tab ? "#302b63" : "transparent",
            color: activeTab === tab ? "#fff" : "var(--color-text-secondary)",
            fontSize: 13, fontWeight: 500, cursor: "pointer", textTransform: "capitalize"
          }}>
            {tab === "chat" ? "💬 Chat" : tab === "campaigns" ? "📊 Campaigns" : "⚡ Quick Actions"}
          </button>
        ))}
      </div>

      {activeTab === "campaigns" && (
        <div style={{ padding: "0 4px" }}>
          <CampaignTable onAnalyse={(p) => { setActiveTab("chat"); sendMessage(p); }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {SAMPLE_CAMPAIGNS.map((c, i) => (
              <div key={i} style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: 14, border: "1px solid var(--color-border-tertiary)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "var(--color-text-primary)" }}>{c.name}</p>
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 10,
                    background: c.roas >= 300 ? "#d1fae5" : c.roas >= 150 ? "#fef3c7" : "#fee2e2",
                    color: c.roas >= 300 ? "#065f46" : c.roas >= 150 ? "#92400e" : "#991b1b",
                  }}>{c.roas >= 300 ? "Strong" : c.roas >= 150 ? "Average" : "Weak"}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[["ROAS", `${c.roas}%`], ["QS", `${c.qs}/10`], ["CTR", `${c.ctr}%`], ["CPC", `£${c.cpc.toFixed(2)}`]].map(([k, v]) => (
                    <div key={k}>
                      <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-secondary)" }}>{k}</p>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{v}</p>
                    </div>
                  ))}
                </div>
                <button onClick={() => { setActiveTab("chat"); sendMessage(`Analyse my ${c.name} campaign in detail. It has: CTR ${c.ctr}%, CPC £${c.cpc.toFixed(2)}, ${c.conversions} conversions, ROAS ${c.roas}%, Quality Score ${c.qs}/10, Budget £${c.budget} with £${c.spend} spend. What specific optimisations would you recommend?`); }}
                  style={{ marginTop: 10, width: "100%", padding: "6px", fontSize: 11, borderRadius: 6, border: "1px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer" }}>
                  Deep analyse ↗
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "actions" && (
        <div style={{ padding: "0 4px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {QUICK_ACTIONS.map((a, i) => (
            <button key={i} onClick={() => { setActiveTab("chat"); sendMessage(a.prompt); }}
              style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 500, transition: "all 0.15s" }}
              onMouseEnter={e => e.target.style.borderColor = "#302b63"}
              onMouseLeave={e => e.target.style.borderColor = "var(--color-border-secondary)"}
            >
              {a.label} ↗
            </button>
          ))}
        </div>
      )}

      {activeTab === "chat" && (
        <div style={{ padding: "0 4px" }}>
          {/* Campaign table shown initially */}
          {showCampaigns && messages.length === 0 && (
            <CampaignTable onAnalyse={sendMessage} />
          )}

          {/* Welcome state */}
          {messages.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 20px 24px", color: "var(--color-text-secondary)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⚡</div>
              <p style={{ margin: "0 0 4px", fontWeight: 500, color: "var(--color-text-primary)", fontSize: 15 }}>Your PPC Expert is Ready</p>
              <p style={{ margin: "0 0 20px", fontSize: 13 }}>Ask anything about campaign optimisation, or try a quick action below</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {QUICK_ACTIONS.slice(0, 3).map((a, i) => (
                  <button key={i} onClick={() => sendMessage(a.prompt)}
                    style={{ padding: "8px 14px", borderRadius: 20, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", cursor: "pointer", fontSize: 12 }}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.length > 0 && (
            <div style={{ minHeight: 200, marginBottom: 16 }}>
              {messages.map((msg, i) => <Message key={i} msg={msg} />)}
              {loading && (
                <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: "#fff", flexShrink: 0 }}>AI</div>
                  <div style={{ background: "var(--color-background-secondary)", borderRadius: "4px 16px 16px 16px", padding: "14px 18px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[0, 0.2, 0.4].map((d, i) => (
                        <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-text-tertiary)", animation: `pulse 1.2s ease-in-out ${d}s infinite` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input */}
          <div style={{ display: "flex", gap: 8, position: "sticky", bottom: 0, background: "var(--color-background-primary)", paddingTop: 8 }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about campaign optimisations, bid strategy, quality scores..."
              disabled={loading}
              rows={1}
              style={{
                flex: 1, padding: "11px 14px", borderRadius: 10, border: "1px solid var(--color-border-secondary)",
                background: "var(--color-background-secondary)", color: "var(--color-text-primary)",
                fontSize: 14, resize: "none", outline: "none", lineHeight: 1.5,
                fontFamily: "var(--font-sans)"
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              style={{
                padding: "0 18px", borderRadius: 10, border: "none",
                background: loading || !input.trim() ? "var(--color-background-tertiary)" : "linear-gradient(135deg, #302b63, #24243e)",
                color: loading || !input.trim() ? "var(--color-text-tertiary)" : "#fff",
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                fontSize: 18, fontWeight: 500
              }}
            >
              ↑
            </button>
          </div>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "6px 0 0", textAlign: "center" }}>
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
