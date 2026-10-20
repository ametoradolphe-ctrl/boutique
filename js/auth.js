(function () {
  var C = window.KOLINK_CONFIG || {};
  var KEY = "kolink_session";

  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  function fr(msg) {
    var m = String(msg || "").toLowerCase();
    if (m.indexOf("invalid login") > -1) return "Email ou mot de passe incorrect.";
    if (m.indexOf("already registered") > -1) return "Un compte existe déjà avec cet email.";
    if (m.indexOf("rate limit") > -1 || m.indexOf("too many") > -1) return "Trop de tentatives. Réessaie dans quelques minutes.";
    if (m.indexOf("password") > -1) return "Mot de passe refusé : utilise au moins 8 caractères.";
    if (m.indexOf("email") > -1) return "Adresse email invalide.";
    return "Une erreur est survenue. Réessaie.";
  }

  function pack(d) {
    return {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: Date.now() + (d.expires_in || 3600) * 1000 - 60000,
      user: d.user ? { id: d.user.id, email: d.user.email } : null
    };
  }

  function authCall(path, body, token) {
    var h = { apikey: C.SUPABASE_KEY, "Content-Type": "application/json" };
    if (token) h.Authorization = "Bearer " + token;
    return fetch(C.SUPABASE_URL + "/auth/v1/" + path, {
      method: "POST", headers: h, body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = {};
        try { d = JSON.parse(t); } catch (e) {}
        if (!r.ok) throw new Error(d.msg || d.error_description || d.message || "Erreur");
        return d;
      });
    });
  }

  function session() {
    var s = load();
    if (!s || !s.access_token) return Promise.resolve(null);
    if (s.expires_at > Date.now()) return Promise.resolve(s);
    return authCall("token?grant_type=refresh_token", { refresh_token: s.refresh_token })
      .then(function (d) {
        var n = pack(d);
        if (!n.user) n.user = s.user;
        save(n);
        return n;
      })
      .catch(function () { clear(); return null; });
  }

  function signup(email, password, name, role) {
    return authCall("signup", {
      email: email, password: password,
      data: { full_name: name, role: role }
    }).then(function (d) {
      if (d.access_token) { save(pack(d)); return { session: true }; }
      return { session: false };
    });
  }

  function login(email, password) {
    return authCall("token?grant_type=password", { email: email, password: password })
      .then(function (d) { save(pack(d)); return true; });
  }

  function logout() {
    var s = load();
    clear();
    if (!s) return Promise.resolve();
    return authCall("logout", {}, s.access_token).catch(function () {});
  }

  function api(path) {
    return session().then(function (s) {
      if (!s) throw new Error("Non connecté");
      return fetch(C.SUPABASE_URL + "/rest/v1/" + path, {
        headers: { apikey: C.SUPABASE_KEY, Authorization: "Bearer " + s.access_token }
      }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
    });
  }

  window.KL = { session: session, signup: signup, login: login, logout: logout, api: api, fr: fr };
})();
