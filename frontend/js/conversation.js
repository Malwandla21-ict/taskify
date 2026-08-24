const currentUser = requireAuth();

const params         = new URLSearchParams(window.location.search);
const conversationId = params.get("id");

const conversationHeader = document.getElementById("conversationHeader");
const messagesThread     = document.getElementById("messagesThread");
const messageForm        = document.getElementById("messageForm");
const messageBody        = document.getElementById("messageBody");

const contextPath = { task: "task-details.html", equipment: "equipment-details.html", sale: "sale-details.html" };

function messageBubble(msg) {
  const isMine = Number(msg.sender_id) === Number(currentUser.id);
  return `
    <div style="align-self:${isMine ? "flex-end" : "flex-start"};max-width:70%;">
      <div style="background:${isMine ? "var(--ump-navy)" : "var(--background)"};color:${isMine ? "white" : "var(--text)"};padding:10px 14px;border-radius:var(--radius-lg);font-size:13px;line-height:1.5;">
        ${msg.body}
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:4px;${isMine ? "justify-content:flex-end;" : ""}">
        <span style="font-size:10px;color:var(--muted);">${new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        ${!isMine ? `<button class="flag-message-btn" data-message-id="${msg.id}" style="background:none;border:none;color:var(--muted);font-size:10px;cursor:pointer;text-decoration:underline;">Report</button>` : ""}
      </div>
    </div>`;
}

function renderMessages(messages) {
  messagesThread.innerHTML = messages.length
    ? messages.map(messageBubble).join("")
    : `<p style="color:var(--muted);font-size:13px;text-align:center;margin:auto;">No messages yet — say hello!</p>`;
  messagesThread.scrollTop = messagesThread.scrollHeight;
  attachFlagEvents();
}

function attachFlagEvents() {
  document.querySelectorAll(".flag-message-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const reason = prompt("Why are you reporting this message? (min. 5 characters)");
      if (!reason || reason.trim().length < 5) return;
      try {
        await apiRequest(`/conversations/messages/${btn.dataset.messageId}/flag`, "POST", { reason: reason.trim() });
        showToast("Message reported. An admin will review it.");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

async function loadConversation() {
  try {
    const [messagesRes, myConvRes] = await Promise.all([
      apiRequest(`/conversations/${conversationId}/messages`),
      apiRequest("/conversations/my")
    ]);

    const conv = myConvRes.data.find(c => Number(c.id) === Number(conversationId));
    if (conv) {
      conversationHeader.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="market-avatar" style="width:44px;height:44px;">${avatarHtml(conv.other_user_name, conv.other_user_photo)}</div>
          <div>
            <div class="profile-link" data-user-id="${conv.other_user_id}" style="cursor:pointer;font-weight:700;font-size:15px;">${conv.other_user_name}</div>
            <a href="./${contextPath[conv.context_type]}?id=${conv.context_id}" style="font-size:12px;color:var(--ump-navy);font-weight:600;">
              <i class="ti ti-external-link" aria-hidden="true"></i> ${conv.context_title}
            </a>
          </div>
        </div>`;
      attachProfileLinkEvents();
    }

    renderMessages(messagesRes.data);
  } catch (err) {
    messagesThread.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

messageForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const body = messageBody.value.trim();
  if (!body) return;

  const submitBtn = messageForm.querySelector("button[type='submit']");
  const originalHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;

  try {
    await apiRequest(`/conversations/${conversationId}/messages`, "POST", { body });
    messageBody.value = "";
    await loadConversation();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHtml;
  }
});

loadConversation();
setInterval(loadConversation, 8000);