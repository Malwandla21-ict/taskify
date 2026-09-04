const currentUser = requireAuth();

const conversationsListContainer = document.getElementById("conversationsListContainer");
const conversationSearchInput    = document.getElementById("conversationSearchInput");
const threadPane        = document.getElementById("threadPane");
const threadEmptyState  = document.getElementById("threadEmptyState");
const threadContent     = document.getElementById("threadContent");
const threadAvatar      = document.getElementById("threadAvatar");
const threadUserName    = document.getElementById("threadUserName");
const threadViewProfileButton = document.getElementById("threadViewProfileButton");
const threadContextCard  = document.getElementById("threadContextCard");
const threadContextThumb = document.getElementById("threadContextThumb");
const threadContextTitle = document.getElementById("threadContextTitle");
const threadContextMeta  = document.getElementById("threadContextMeta");
const threadContextStatus = document.getElementById("threadContextStatus");
const messagesThread    = document.getElementById("messagesThread");
const messageForm       = document.getElementById("messageForm");
const messageBody       = document.getElementById("messageBody");
const threadBackButton  = document.getElementById("threadBackButton");

const CONTEXT_META = {
  task:      { path: "task-details.html",      apiPath: "tasks",     icon: "ti-clipboard-list", label: "Task" },
  equipment: { path: "equipment-details.html",  apiPath: "equipment", icon: "ti-package",       label: "Rental" },
  sale:      { path: "sale-details.html",       apiPath: "sales",     icon: "ti-shopping-bag",  label: "Sale" }
};

let cachedConversations = [];
let activeConversationId = null;
let activeContextFilter  = "All";

function timeLabel(dateStr) {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function relativeDate(dateStr) {
  const d = new Date(dateStr);
  const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (dayStart.getTime() === today.getTime()) return timeLabel(dateStr);
  if (dayStart.getTime() === yesterday.getTime()) return "Yesterday";
  const daysAgo = Math.round((today - dayStart) / 86400000);
  if (daysAgo < 7) return `${daysAgo}d ago`;
  return dayStart.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

function dayLabelFor(dateStr) {
  const d = new Date(dateStr);
  const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (dayStart.getTime() === today.getTime()) return "Today";
  if (dayStart.getTime() === yesterday.getTime()) return "Yesterday";
  return dayStart.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });
}

/* ── Conversation list ── */
function conversationItem(conv) {
  const meta = CONTEXT_META[conv.context_type] || { icon: "ti-message-circle", label: "" };
  const preview = conv.last_message
    ? (conv.last_message.length > 48 ? conv.last_message.slice(0, 48) + "…" : conv.last_message)
    : "No messages yet — say hello!";
  const timeText = conv.last_message_at ? relativeDate(conv.last_message_at) : "";

  return `
    <div class="conversation-item ${Number(conv.id) === Number(activeConversationId) ? "active" : ""}" data-conv-id="${conv.id}">
      <div class="conversation-item-avatar">${avatarHtml(conv.other_user_name, conv.other_user_photo)}</div>
      <div class="conversation-item-info">
        <div class="conversation-item-top">
          <div class="conversation-item-name">${conv.other_user_name}</div>
          <div class="conversation-item-time">${timeText}</div>
        </div>
        <div class="conversation-item-context"><i class="ti ${meta.icon}" aria-hidden="true"></i> ${conv.context_title}</div>
        <div class="conversation-item-preview">${preview}</div>
      </div>
    </div>`;
}

function getFilteredConversations() {
  const q = conversationSearchInput?.value.trim().toLowerCase() || "";
  return cachedConversations.filter(c => {
    const matchesContext = activeContextFilter === "All" || c.context_type === activeContextFilter;
    const matchesSearch = !q || [c.other_user_name, c.context_title, c.last_message].some(f => f?.toLowerCase().includes(q));
    return matchesContext && matchesSearch;
  });
}

function renderConversationsList() {
  const filtered = getFilteredConversations();
  conversationsListContainer.innerHTML = filtered.length
    ? filtered.map(conversationItem).join("")
    : emptyState("ti-message-circle", "No conversations yet", "Message a task, rental or sale owner to start one.");

  conversationsListContainer.querySelectorAll(".conversation-item").forEach(el => {
    el.addEventListener("click", () => openConversation(Number(el.dataset.convId)));
  });
}

document.querySelectorAll(".messages-list-header .filter-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".messages-list-header .filter-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeContextFilter = btn.dataset.context;
    renderConversationsList();
  });
});
conversationSearchInput?.addEventListener("input", renderConversationsList);

/* ── Thread ── */
function messageBubble(msg) {
  const isMine = Number(msg.sender_id) === Number(currentUser.id);
  return `
    <div class="message-bubble-row ${isMine ? "mine" : ""}">
      <div>
        <div class="message-bubble">${msg.body}</div>
        <div class="message-meta">
          <span>${timeLabel(msg.created_at)}</span>
          ${!isMine ? `<button type="button" class="message-report-link" data-message-id="${msg.id}">Report</button>` : ""}
        </div>
      </div>
    </div>`;
}

function renderMessages(messages) {
  if (!messages.length) {
    messagesThread.innerHTML = `<p style="color:var(--muted);font-size:13px;text-align:center;margin:auto;">No messages yet — say hello!</p>`;
    return;
  }

  const groups = new Map();
  messages.forEach(m => {
    const label = dayLabelFor(m.created_at);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(m);
  });

  let html = "";
  for (const [label, items] of groups) {
    html += `<div class="thread-day-label">${label}</div>`;
    html += items.map(messageBubble).join("");
  }
  messagesThread.innerHTML = html;
  messagesThread.scrollTop = messagesThread.scrollHeight;
  attachReportEvents();
}

function attachReportEvents() {
  document.querySelectorAll(".message-report-link").forEach(btn => {
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

/* Enriches the context card with a real fetch to the underlying listing —
   the conversation itself only carries a title (see conversation.service.js
   getContextListing), so price/category/status come from a second call to
   the same endpoints task-details.js / equipment-details.js / sale-details.js
   already use. */
async function loadContextCard(conv) {
  const meta = CONTEXT_META[conv.context_type];
  threadContextCard.href = `./${meta.path}?id=${conv.context_id}`;

  try {
    const res = await apiRequest(`/${meta.apiPath}/${conv.context_id}`);
    const item = res.data;

    let title, categoryLabel, priceLabel, statusLabel, statusColor;
    if (conv.context_type === "task") {
      title = item.title; categoryLabel = item.category; priceLabel = `R${item.price} / task`;
      statusLabel = item.status; statusColor = item.status === "Posted" ? "green" : item.status === "Completed" ? "navy" : "gold";
    } else if (conv.context_type === "equipment") {
      title = item.name; categoryLabel = item.category; priceLabel = `R${item.daily_price} / day`;
      statusLabel = item.is_available ? "Available" : "Booked"; statusColor = item.is_available ? "green" : "gold";
    } else {
      title = item.title; categoryLabel = item.category; priceLabel = `R${item.price}`;
      statusLabel = item.status; statusColor = item.status === "Available" ? "green" : "navy";
    }

    threadContextTitle.textContent = title;
    threadContextMeta.textContent = categoryLabel ? `${categoryLabel} · ${priceLabel}` : priceLabel;
    threadContextThumb.innerHTML = `<i class="ti ${meta.icon}" aria-hidden="true"></i>`;
    threadContextStatus.innerHTML = `<div class="badge ${statusColor}">${statusLabel}</div>`;
    threadContextCard.style.display = "flex";
  } catch (err) {
    threadContextTitle.textContent = conv.context_title || "Listing no longer available";
    threadContextMeta.textContent = "This listing may have been removed.";
    threadContextThumb.innerHTML = `<i class="ti ti-alert-triangle" aria-hidden="true"></i>`;
    threadContextStatus.innerHTML = "";
    threadContextCard.style.display = "flex";
  }
}

async function openConversation(id) {
  activeConversationId = id;
  document.body.classList.add("thread-open");
  threadEmptyState.style.display = "none";
  threadContent.style.display = "flex";

  renderConversationsList();

  const conv = cachedConversations.find(c => Number(c.id) === Number(id));
  if (conv) {
    threadAvatar.innerHTML = avatarHtml(conv.other_user_name, conv.other_user_photo);
    threadUserName.textContent = conv.other_user_name;
    threadUserName.dataset.userId = conv.other_user_id;
    threadViewProfileButton.dataset.userId = conv.other_user_id;
    loadContextCard(conv);
  }

  attachProfileLinkEvents();
  await loadMessages();
}

async function loadMessages() {
  if (!activeConversationId) return;
  try {
    const res = await apiRequest(`/conversations/${activeConversationId}/messages`);
    renderMessages(res.data);
  } catch (err) {
    messagesThread.innerHTML = errorState(err.message);
  }
}

threadBackButton?.addEventListener("click", () => {
  document.body.classList.remove("thread-open");
});

messageForm?.addEventListener("submit", async e => {
  e.preventDefault();
  const body = messageBody.value.trim();
  if (!body || !activeConversationId) return;

  const submitBtn = messageForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;

  try {
    await apiRequest(`/conversations/${activeConversationId}/messages`, "POST", { body });
    messageBody.value = "";
    await loadMessages();
    await loadConversations({ silent: true });
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    messageBody.focus();
  }
});

async function loadConversations({ silent = false } = {}) {
  try {
    const res = await apiRequest("/conversations/my");
    cachedConversations = res.data;
    renderConversationsList();

    const params = new URLSearchParams(window.location.search);
    const deepLinkId = params.get("id");
    if (deepLinkId && !activeConversationId) {
      openConversation(Number(deepLinkId));
    }
  } catch (err) {
    if (!silent) {
      conversationsListContainer.innerHTML = errorState(err.message);
      showToast(err.message, "error");
    }
  }
}

loadConversations();

/* Poll for new messages in the open thread and refresh the list preview,
   same 8s cadence the original single-thread page used. */
setInterval(() => {
  if (activeConversationId) loadMessages();
  loadConversations({ silent: true });
}, 8000);