const currentUser = requireAuth();
const conversationsContainer = document.getElementById("conversationsContainer");

const contextIcon = { task: "ti-clipboard-list", equipment: "ti-package", sale: "ti-shopping-bag" };

function conversationCard(conv) {
  const preview = conv.last_message
    ? (conv.last_message.length > 60 ? conv.last_message.slice(0, 60) + "…" : conv.last_message)
    : "No messages yet — say hello!";
  const timeLabel = conv.last_message_at ? new Date(conv.last_message_at).toLocaleDateString() : "";

  return `
    <a href="./conversation.html?id=${conv.id}" class="market-card" style="text-decoration:none;display:block;">
      <div class="market-content">
        <div class="market-top">
          <div class="market-user">
            <div class="market-avatar">${avatarHtml(conv.other_user_name, conv.other_user_photo)}</div>
            <div>
              <div class="market-user-name">${conv.other_user_name}</div>
              <div class="market-user-meta"><i class="ti ${contextIcon[conv.context_type]}" aria-hidden="true"></i> ${conv.context_title}</div>
            </div>
          </div>
          <div style="font-size:11px;color:var(--muted);">${timeLabel}</div>
        </div>
        <p style="color:var(--muted);font-size:13px;">${preview}</p>
      </div>
    </a>`;
}

async function loadConversations() {
  try {
    const res = await apiRequest("/conversations/my");
    conversationsContainer.innerHTML = res.data.length
      ? res.data.map(conversationCard).join("")
      : emptyState("ti-message-circle", "No conversations yet", "Message a task, rental or sale owner to start one.");
  } catch (err) {
    conversationsContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

loadConversations();