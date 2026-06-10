export default async function handler(req, res) {
  const BASE = process.env.CANVAS_BASE_URL;
  const ACCOUNT_ID = process.env.CANVAS_ACCOUNT_ID || "1";
  const PREFIJO = process.env.PREFIJO_DISABLED || "D1sVb13d_";

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  function headersCanvasGET() {
    return {
      "Authorization": `Bearer ${process.env.CANVAS_TOKEN}`,
      "User-Agent": "IC-TI-Tools/1.0 (Canvas Proxy; ti@calidadpucp.pe)",
      "Accept": "application/json"
    };
  }

  function headersCanvasMUTATE() {
    return {
      ...headersCanvasGET(),
      "Content-Type": "application/json"
    };
  }

  async function canvasFetch(endpoint, options = {}) {
    const method = options.method || "GET";
    const headers = method === "GET" ? headersCanvasGET() : headersCanvasMUTATE();

    const response = await fetch(`${BASE}${endpoint}`, {
      ...options,
      method,
      headers
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Canvas error",
        status: response.status,
        body: text
      });
    }

    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(text);
  }

  const path = req.url.split("?")[0].replace("/api/proxy", "") || "/";
  const params = new URLSearchParams(req.url.includes("?") ? req.url.split("?")[1] : "");

  // TEST
  if (path === "/" || path === "") {
    return res.json({ ok: true, service: "ic-canvas-proxy" });
  }

  // BUSCAR USUARIO POR SIS
  if (path === "/user") {
    const sis = params.get("sis");
    return canvasFetch(`/users/sis_user_id:${encodeURIComponent(sis)}`);
  }

  // LOGINS
  if (path === "/logins") {
    const user_id = params.get("user_id");
    return canvasFetch(`/accounts/${ACCOUNT_ID}/logins?user_id=${encodeURIComponent(user_id)}&per_page=100`);
  }

  // CURSO
  if (path === "/course") {
    const course_id = params.get("course_id");
    return canvasFetch(`/courses/${encodeURIComponent(course_id)}`);
  }

  // MATRÍCULAS ACTIVAS
  if (path === "/enrollments") {
    const user_id = params.get("user_id");
    return canvasFetch(`/users/${encodeURIComponent(user_id)}/enrollments?state[]=active&per_page=100&include[]=course`);
  }

  // ELIMINAR MATRÍCULA
  if (path === "/delete-enrollment" && req.method === "POST") {
    const { course_id, enrollment_id } = req.body;
    return canvasFetch(
      `/courses/${course_id}/enrollments/${enrollment_id}?task=delete`,
      { method: "DELETE" }
    );
  }

  // DAR DE BAJA
  if (path === "/baja" && req.method === "POST") {
    const { user_id, email } = req.body;

    if (email && !email.startsWith(PREFIJO)) {
      await fetch(`${BASE}/users/${user_id}`, {
        method: "PUT",
        headers: headersCanvasMUTATE(),
        body: JSON.stringify({ user: { email: `${PREFIJO}${email}` } })
      });
    }

    const loginsRes = await fetch(
      `${BASE}/accounts/${ACCOUNT_ID}/logins?user_id=${user_id}&per_page=100`,
      { headers: headersCanvasGET() }
    );
    const logins = await loginsRes.json();

    for (const login of logins) {
      const login_id = (login.login_id || "").startsWith(PREFIJO)
        ? login.login_id
        : PREFIJO + (login.login_id || "");

      await fetch(`${BASE}/accounts/${ACCOUNT_ID}/logins/${login.id}`, {
        method: "PUT",
        headers: headersCanvasMUTATE(),
        body: JSON.stringify({ login: { login_id, workflow_state: "suspended" } })
      });
    }

    await fetch(`${BASE}/users/${user_id}/sessions`, { method: "DELETE", headers: headersCanvasGET() });
    await fetch(`${BASE}/users/${user_id}/mobile_sessions`, { method: "DELETE", headers: headersCanvasGET() });

    return res.json({ ok: true });
  }

  // REACTIVAR
  if (path === "/reactivar" && req.method === "POST") {
    const { user_id, email } = req.body;

    if (email && email.startsWith(PREFIJO)) {
      const normal = email.replace(PREFIJO, "");
      await fetch(`${BASE}/users/${user_id}`, {
        method: "PUT",
        headers: headersCanvasMUTATE(),
        body: JSON.stringify({ user: { email: normal } })
      });
    }

    const loginsRes = await fetch(
      `${BASE}/accounts/${ACCOUNT_ID}/logins?user_id=${user_id}&per_page=100`,
      { headers: headersCanvasGET() }
    );
    const logins = await loginsRes.json();

    for (const login of logins) {
      const login_id = (login.login_id || "").replace(PREFIJO, "");
      await fetch(`${BASE}/accounts/${ACCOUNT_ID}/logins/${login.id}`, {
        method: "PUT",
        headers: headersCanvasMUTATE(),
        body: JSON.stringify({ login: { login_id, workflow_state: "active" } })
      });
    }

    return res.json({ ok: true });
  }

  // GLOBAL LOGINS PAGE
  if (path === "/global-logins-page") {
    const page = params.get("page") || "1";
    const response = await fetch(
      `${BASE}/accounts/${ACCOUNT_ID}/users?per_page=100&page=${encodeURIComponent(page)}`,
      { headers: headersCanvasGET() }
    );
    const text = await response.text();
    res.setHeader("Content-Type", "application/json");
    return res.status(response.status).send(text);
  }

  // ROLES DE UN USUARIO
  if (path === "/user-roles") {
    const user_id = params.get("user_id");
    return canvasFetch(`/users/${encodeURIComponent(user_id)}/enrollments?state[]=active&per_page=100`);
  }

  return res.status(404).json({ error: "Not found" });
}
