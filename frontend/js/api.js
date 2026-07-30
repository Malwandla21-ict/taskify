const API_BASE_URL = "http://127.0.0.1:5000/api";

async function apiRequest(endpoint, method = "GET", body = null, token = null) {
  const resolvedToken = token || localStorage.getItem("taskifyToken");

  const headers = { "Content-Type": "application/json" };
  if (resolvedToken) headers.Authorization = `Bearer ${resolvedToken}`;

  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  /* If response is not JSON (e.g. HTML error page), catch it clearly */
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    throw new Error(`Server error (${response.status}). Is your backend running?`);
  }

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Something went wrong.");

  return data;
}