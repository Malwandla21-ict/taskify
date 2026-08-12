const currentUser = requireAuth();
const notificationsContainer = document.getElementById("notificationsContainer");

/* Renders inline action buttons for notifications that need a response,
   using the context_type/context_id the backend now attaches. Everything
   else falls back to a simple "View" deep link where a target exists. */
function notificationActionsHtml(n) {
  if (n.context_type === "equipment_booking" && n.title === "Booking Request") {
    return `
      <div class="notification-action-row">
        <button class="market-action-btn confirm-notif-booking-btn" data-booking-id="${n.context_id}" data-notif-id="${n.id}">
          <i class="ti ti-check" aria-hidden="true"></i> Confirm
        </button>
        <button class="market-action-btn outline decline-notif-booking-btn" data-booking-id="${n.context_id}" data-notif-id="${n.id}" style="background:rgba(224,58,62,0.08);color:var(--ump-red);border-color:rgba(224,58,62,0.20);">
          <i class="ti ti-x" aria-hidden="true"></i> Decline
        </button>
      </div>`;
  }
  if (n.context_type === "task" && n.title === "Task Marked as Done") {
    return `
      <div class="notification-action-row">
        <button class="market-action-btn confirm-notif-task-btn" data-task-id="${n.context_id}" data-notif-id="${n.id}" style="background:var(--ump-green);">
          <i class="ti ti-circle-check" aria-hidden="true"></i> Confirm Completion
        </button>
      </div>`;
  }
  if (n.context_type === "task") {
    return `<div class="notification-action-row"><a class="market-action-btn outline" href="./task-details.html?id=${n.context_id}"><i class="ti ti-eye" aria-hidden="true"></i> View Task</a></div>`;
  }
  if (n.context_type === "sales_item") {
    return `<div class="notification-action-row"><a class="market-action-btn outline" href="./sale-details.html?id=${n.context_id}"><i class="ti ti-eye" aria-hidden="true"></i> View Item</a></div>`;
  }
  return "";
}

function renderNotifications(notifications) {
  if (!notifications.length) {
    notificationsContainer.innerHTML = emptyState("ti-bell", "No notifications yet", "Updates about your tasks and rentals will appear here.");
    return;
  }

  notificationsContainer.innerHTML = notifications.map(n => `
    <div class="market-card">
      <div class="market-content">
        <div class="market-top">
          ${badge(n.is_read ? "Read" : "Unread", n.is_read ? "" : "gold")}
          <span style="font-size:11px;color:var(--muted);">${new Date(n.created_at).toLocaleString()}</span>
        </div>
        <h3 style="font-size:15px;">${n.title}</h3>
        <p style="color:var(--muted);font-size:13px;line-height:1.6;">${n.message}</p>
        ${notificationActionsHtml(n)}
        ${!n.is_read ? `
          <button class="market-action-btn outline mark-read-btn" data-id="${n.id}" style="margin-top:10px;">
            <i class="ti ti-check" aria-hidden="true"></i> Mark as Read
          </button>` : ""}
      </div>
    </div>`).join("");

  attachNotificationEvents();
}

function attachNotificationEvents() {
  document.querySelectorAll(".mark-read-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/notifications/${btn.dataset.id}/read`, "PATCH");
        await loadNotifications();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-check" aria-hidden="true"></i> Mark as Read`;
      }
    });
  });

  document.querySelectorAll(".confirm-notif-booking-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/equipment/bookings/${btn.dataset.bookingId}/confirm`, "PATCH");
        await apiRequest(`/notifications/${btn.dataset.notifId}/read`, "PATCH").catch(() => {});
        showToast("Booking confirmed!");
        await loadNotifications();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-check" aria-hidden="true"></i> Confirm`;
      }
    });
  });

  document.querySelectorAll(".decline-notif-booking-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Decline this booking request?")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/equipment/bookings/${btn.dataset.bookingId}/decline`, "PATCH");
        await apiRequest(`/notifications/${btn.dataset.notifId}/read`, "PATCH").catch(() => {});
        showToast("Booking declined.");
        await loadNotifications();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-x" aria-hidden="true"></i> Decline`;
      }
    });
  });

  document.querySelectorAll(".confirm-notif-task-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Confirm this task is complete? This will release payment to the worker.")) return;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader" aria-hidden="true"></i>`;
      try {
        await apiRequest(`/tasks/${btn.dataset.taskId}/confirm-completion`, "PATCH");
        await apiRequest(`/notifications/${btn.dataset.notifId}/read`, "PATCH").catch(() => {});
        showToast("Task completed and payment released!");
        await loadNotifications();
      } catch (err) {
        showToast(err.message, "error");
        btn.disabled = false;
        btn.innerHTML = `<i class="ti ti-circle-check" aria-hidden="true"></i> Confirm Completion`;
      }
    });
  });
}

async function loadNotifications() {
  try {
    const res = await apiRequest("/notifications");
    renderNotifications(res.data);
  } catch (err) {
    notificationsContainer.innerHTML = errorState(err.message);
    showToast(err.message, "error");
  }
}

loadNotifications();