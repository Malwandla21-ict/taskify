const notificationsContainer =
  document.getElementById("notificationsContainer");

const toastContainer =
  document.getElementById("toastContainer");

const storedToken =
  localStorage.getItem("taskifyToken");

if (!storedToken) {
  window.location.href = "./login.html";
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

async function loadNotifications() {
  try {
    const response = await apiRequest(
      "/notifications",
      "GET",
      null,
      storedToken
    );

    renderNotifications(response.data);
  } catch (error) {
    notificationsContainer.innerHTML =
      `<p style="color:red;">${error.message}</p>`;

    showToast(error.message, "error");
  }
}

function renderNotifications(notifications) {
  if (notifications.length === 0) {
    notificationsContainer.innerHTML =
      "<p>No notifications yet.</p>";
    return;
  }

  notificationsContainer.innerHTML = notifications
    .map((notification) => {
      return `
        <div class="market-card">
          <div class="market-content">

            <div class="market-top">
              <div class="badge">
                ${notification.is_read ? "Read" : "Unread"}
              </div>

              <div style="color:#6b7280; font-size:14px;">
                ${new Date(notification.created_at).toLocaleString()}
              </div>
            </div>

            <h3>${notification.title}</h3>

            <p style="color:#6b7280; line-height:1.7;">
              ${notification.message}
            </p>

            ${
              notification.is_read
                ? ""
                : `
                  <button
                    class="primary-button mark-read-btn"
                    data-id="${notification.id}"
                    style="margin-top:20px;"
                  >
                    Mark as Read
                  </button>
                `
            }

          </div>
        </div>
      `;
    })
    .join("");

  attachMarkReadEvents();
}

function attachMarkReadEvents() {
  document.querySelectorAll(".mark-read-btn")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Updating...";

        try {
          await apiRequest(
            `/notifications/${button.dataset.id}/read`,
            "PATCH",
            null,
            storedToken
          );

          showToast("Notification marked as read.");
          await loadNotifications();
        } catch (error) {
          showToast(error.message, "error");
          button.disabled = false;
          button.textContent = "Mark as Read";
        }
      });
    });
}

loadNotifications();