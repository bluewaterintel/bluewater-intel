/* Bluewater Intel — Auth-gate UI wiring (sign in/out, plan onboarding)
 * Extracted verbatim from an inline <script> block in index.html (Approach A).
 * Loaded as a plain classic <script src> at the SAME document position, so
 * execution order, global scope, and file:// offline all behave identically.
 * DO NOT reorder relative to the other bw-*.js tags. */

(function(){
  const gate = document.getElementById("bw-auth-gate");
  const msg = document.getElementById("bw-auth-msg");
  const welcome = document.getElementById("bw-auth-welcome");
  const emailEl = document.getElementById("bw-auth-email");
  const passEl = document.getElementById("bw-auth-password");
  const forgotEl = document.getElementById("bw-auth-forgot");
  // Tracks which signed-in user we've already run the one-time plan-onboarding
  // check for, so background auth re-fires don't re-prompt for a plan.
  let _planOnboardCheckedFor = null;

  function showErr(t){ msg.textContent=t; msg.style.color="#fca5a5"; msg.style.display="block"; }
  function showOk(t){
    const resetSent = document.getElementById("bw-auth-reset-sent");
    if(resetSent){ resetSent.style.display = "none"; }
    msg.textContent=t; msg.style.color="#86efac"; msg.style.display="block";
  }
  function showResetSentBanner(){
    if(welcome) welcome.style.display="none";
    msg.style.display="none";
    const resetSent = document.getElementById("bw-auth-reset-sent");
    if(resetSent) resetSent.style.display="block";
    showGate();
  }
  function showWelcomeBanner(){
    if(welcome) welcome.style.display="block";
    showGate();
  }
  function hideGate(){
    if(gate) gate.style.display="none";
    clearAuthKbOpen(gate);
    syncAuthScreenBodyClass();
  }
  function showGate(){
    if(gate) gate.style.display="flex";
    syncAuthScreenBodyClass();
  }
  // Other modules (billing offline handler, plan picker) must not hide the gate
  // unless a real Supabase session exists.
  window.showAuthGate = showGate;
  window.hideAuthGate = hideGate;
  window.syncAuthScreenBodyClass = syncAuthScreenBodyClass;
  function enforceAuthGate(){
    const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
    if(u) return;
    const ca = document.getElementById("create-account-page");
    const pw = document.getElementById("password-recovery-page");
    const caOpen = ca && ca.style.display !== "none";
    const pwOpen = pw && pw.style.display !== "none";
    if(caOpen || pwOpen) return;
    showGate();
  }
  function sessionStill(user){
    const live = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
    return !!(live && user && live.id === user.id);
  }

  // iOS Capacitor sets scrollEnabled:false for the map, which blocks scrolling when
  // the keyboard covers auth fields. Re-enable scroll on auth screens and nudge
  // focused inputs into view.
  let _kbListenerBound = false;
  // Deliberately no Keyboard.setScroll() here. Toggling the WKWebView scroll view
  // at runtime moves its content offset out from under our position:fixed overlay,
  // so buttons render in one place but hit-test in another. The overlay does its
  // own scrolling while .auth-kb-open is set, which needs no native scrolling.
  function authScreensOpen(){
    const ca = document.getElementById("create-account-page");
    const pw = document.getElementById("password-recovery-page");
    const verify = document.getElementById("verify-email-page");
    const verifyOpen = verify && verify.style.display !== "none";
    return (gate && gate.style.display !== "none")
      || (ca && ca.style.display !== "none")
      || (pw && pw.style.display !== "none")
      || verifyOpen;
  }
  function syncAuthScreenBodyClass(){
    try {
      document.body.classList.toggle("bw-auth-screen-open", authScreensOpen());
    } catch(e){ /* non-fatal */ }
  }
  function clearAuthKbOpen(root){
    if(root) root.classList.remove("auth-kb-open");
  }
  function applyAuthKbHeight(h){
    const px = Math.max(0, Number(h) || 0);
    document.querySelectorAll(".auth-fullscreen").forEach((root) => {
      if(root.style.display === "none") return;
      root.style.setProperty("--auth-kb-pad", px > 50 ? (px + 40) + "px" : "0px");
    });
  }
  function syncAuthKbPad(root){
    const vv = window.visualViewport;
    if(!vv || !root) return;
    const kb = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
    applyAuthKbHeight(kb);
  }
  function scrollAuthFieldIntoView(el){
    if(!el) return;
    const root = el.closest(".auth-fullscreen");
    if(!root) return;
    root.classList.add("auth-kb-open");
    syncAuthKbPad(root);
    const doScroll = () => {
      try {
        // Scroll the auth overlay itself — WebView scroll is often disabled.
        const rootRect = root.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const pad = 24;
        const overflow = elRect.bottom + pad - rootRect.bottom;
        if(overflow > 0) root.scrollTop += overflow;
        // Ensure bottom actions (Forgot / Create account) stay reachable on password focus.
        const tail = root.querySelector("#bw-auth-signup, #ca-submit, #pw-submit");
        if(tail && el.matches("#bw-auth-password, #ca-password, #pw-email")){
          const tailRect = tail.getBoundingClientRect();
          const tailOverflow = tailRect.bottom + pad - rootRect.bottom;
          if(tailOverflow > 0) root.scrollTop += tailOverflow;
        }
      } catch(e){
        try { el.scrollIntoView({ block: "center", behavior: "smooth" }); }
        catch(e2){ el.scrollIntoView(true); }
      }
    };
    setTimeout(doScroll, 80);
    setTimeout(doScroll, 320);
  }
  function bindKeyboardHeightListeners(){
    if(_kbListenerBound) return;
    const K = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Keyboard;
    if(!K || !K.addListener) return;
    _kbListenerBound = true;
    K.addListener("keyboardWillShow", (info) => {
      applyAuthKbHeight(info && info.keyboardHeight);
      const active = document.activeElement;
      if(active && active.matches && active.matches("input,textarea,select")){
        scrollAuthFieldIntoView(active);
      }
    }).catch(() => {});
    K.addListener("keyboardWillHide", () => {
      applyAuthKbHeight(0);
      document.querySelectorAll(".auth-fullscreen.auth-kb-open").forEach(clearAuthKbOpen);
    }).catch(() => {});
  }
  function wireAuthFormScroll(root){
    if(!root || root._bwKbWired) return;
    root._bwKbWired = true;
    const onResize = () => syncAuthKbPad(root);
    if(window.visualViewport){
      window.visualViewport.addEventListener("resize", onResize);
      window.visualViewport.addEventListener("scroll", onResize);
    }
    root.querySelectorAll("input, textarea, select").forEach((el) => {
      el.addEventListener("focus", () => {
        scrollAuthFieldIntoView(el);
      });
      el.addEventListener("blur", () => {
        setTimeout(() => {
          const active = document.activeElement;
          if(!root.contains(active) || !(active && active.matches && active.matches("input,textarea,select"))){
            clearAuthKbOpen(root);
            root.style.setProperty("--auth-kb-pad", "0px");
          }
        }, 120);
      });
    });
  }
  bindKeyboardHeightListeners();
  wireAuthFormScroll(gate);
  wireAuthFormScroll(document.getElementById("create-account-page"));
  wireAuthFormScroll(document.getElementById("password-recovery-page"));

  function hideBootChrome(){
    if(typeof window.BW_hideNativeSplash === "function"){
      window.BW_hideNativeSplash().catch(() => {});
    }
  }

  async function onSignedIn(user, event){
    if(!user || !user.id){ enforceAuthGate(); return; }
    if(typeof USER_PREFS !== "undefined"){
      USER_PREFS.account = {
        name: (user.user_metadata && user.user_metadata.full_name) || (user.email ? user.email.split("@")[0] : "Captain"),
        email: user.email || "",
      };
    }
    if(typeof renderAccountSection === "function") renderAccountSection();
    const fullHydrate = !event || event === "INITIAL_SESSION" || event === "SIGNED_IN";
    if(fullHydrate && typeof window.bwOnSignedIn === "function"){
      try { await window.bwOnSignedIn(user); } catch(e){ console.error(e); }
    } else if(typeof window.bwRefreshSessionState === "function"){
      try { await window.bwRefreshSessionState(); } catch(e){ console.error(e); }
    }
    // FREE TIER (Model B): every signed-in user reaches the app. Entitlement
    // (trial / active subscription / owner) unlocks the PRO features — the Bite
    // Map, ocean layers, waypoints, fishing reports, and the AI brief — while
    // free users get the baseline app (maps, major areas, ports, catches,
    // closures, catch-measure, regs) with those PRO features shown but locked.
    // We still refresh entitlement so the correct gating is applied, but we no
    // longer trap unentitled users on the plan picker.
    try {
      if(typeof refreshEntitlement === "function") await refreshEntitlement();
    } catch(e){}
    // Plan onboarding is a ONE-TIME step. Supabase re-fires onAuthChange
    // (SIGNED_IN / TOKEN_REFRESHED) whenever the tab regains focus, which used
    // to re-run the check and re-open the plan picker every time a free user
    // switched away and came back. Evaluate it only once per signed-in user for
    // this page session; on later re-fires just make sure the app is visible.
    if(_planOnboardCheckedFor === user.id){
      const pg = document.getElementById("plan-gate");
      const planOpen = pg && pg.style.display && pg.style.display !== "none";
      if(!planOpen && sessionStill(user)) hideGate();
      else if(!sessionStill(user)) enforceAuthGate();
      return;
    }
    _planOnboardCheckedFor = user.id;  // set BEFORE awaiting so concurrent re-fires can't double-open
    let showPlan = false;
    if(typeof navigator === "undefined" || navigator.onLine !== false){
      try {
        if(typeof window.needsPlanOnboarding === "function") showPlan = await window.needsPlanOnboarding();
      } catch(e){}
    }
    if(showPlan && typeof window.openPostSignupPlans === "function"){
      window.openPostSignupPlans();
      return;
    }
    if(typeof window.closePostSignupPlans === "function") window.closePostSignupPlans();
    if(!sessionStill(user)){ enforceAuthGate(); return; }
    hideGate();
    if(typeof maybeShowFirstLoginOnboarding === "function"){
      try { await maybeShowFirstLoginOnboarding(user); } catch(e){}
    }
  }

  let _wireAttempts = 0;
  function wireAuth(){
    if(!window.BW_AUTH){
      _wireAttempts++;
      if(_wireAttempts > 50){
        hideBootChrome();
        enforceAuthGate();
        return;
      }
      setTimeout(wireAuth, 100);
      return;
    }
    window.BW_AUTH.onAuthChange(async (user, event) => {
      if(user){
        hideBootChrome();
        await onSignedIn(user, event);
      }
      // Don't flash the sign-in gate while the saved session is still loading.
      else if(window.BW_AUTH.isAuthInitDone && window.BW_AUTH.isAuthInitDone()){
        hideBootChrome();
        enforceAuthGate();
      }
    });
    window.BW_AUTH.whenReady().then(async (session) => {
      hideBootChrome();
      // Validate persisted session — stale tokens must not skip the sign-in gate.
      let user = session && session.user ? session.user : null;
      if(user && typeof navigator !== "undefined" && navigator.onLine !== false){
        try {
          const { data: { user: live }, error } = await window.BW_AUTH._sb.auth.getUser();
          if(error || !live){
            try { await window.BW_AUTH.signOut(); } catch(e){}
            user = null;
          } else {
            user = live;
          }
        } catch(e){
          user = null;
        }
      }
      if(!user) enforceAuthGate();
    }).catch(() => {
      hideBootChrome();
      enforceAuthGate();
    });
  }
  wireAuth();

  // Safety net: if anything hid the gate while unsigned, put it back.
  function authWatchdog(){
    if(window.BW_AUTH && window.BW_AUTH.isAuthInitDone && !window.BW_AUTH.isAuthInitDone()) return;
    const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
    if(u) return;
    if(gate && gate.style.display === "none") enforceAuthGate();
  }
  setTimeout(authWatchdog, 1200);
  setTimeout(authWatchdog, 3500);

  // Email-confirmation return: ?confirmed=1 on the sign-in gate.
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("confirmed") === "1") {
      history.replaceState({}, "", location.origin + location.pathname);
      const handleConfirmedReturn = async () => {
        // If Supabase auto-established a session from the confirmation link (the
        // common case), the user is now signed in and hasn't picked a plan yet —
        // send them STRAIGHT to the Choose Your Plan screen rather than flashing
        // the sign-in page first. onSignedIn also handles this, but we invoke the
        // plan picker directly here so there's no sign-in-gate flash in between.
        if (window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser()) {
          let showPlan = false;
          try { if(typeof window.needsPlanOnboarding === "function") showPlan = await window.needsPlanOnboarding(); } catch(e){}
          if(showPlan && typeof window.openPostSignupPlans === "function"){
            if(typeof hideGate === "function") hideGate();
            window.openPostSignupPlans();
          }
          return;  // signed in → onSignedIn handles the rest
        }
        // No auto-session (they must sign in manually) → show the welcome banner
        // on the sign-in screen so they know their email is confirmed.
        showWelcomeBanner();
      };
      if (window.BW_AUTH) {
        setTimeout(handleConfirmedReturn, 600);
      } else {
        const waitAuth = setInterval(() => {
          if (!window.BW_AUTH) return;
          clearInterval(waitAuth);
          setTimeout(handleConfirmedReturn, 400);
        }, 100);
      }
    }
    if (q.get("recovery") === "1") {
      history.replaceState({}, "", location.origin + location.pathname);
      const handleRecoveryReturn = () => {
        if (typeof window.openPasswordRecoveryModal === "function") {
          window.openPasswordRecoveryModal();
        }
      };
      if (window.BW_AUTH) {
        setTimeout(handleRecoveryReturn, 600);
      } else {
        const waitAuth = setInterval(() => {
          if (!window.BW_AUTH) return;
          clearInterval(waitAuth);
          setTimeout(handleRecoveryReturn, 400);
        }, 100);
      }
    }
  } catch (e) {}

  // Basic field validation so an empty submit can't fall through to an
  // anonymous sign-in attempt (which the project disables → confusing error).
  function validCreds(){
    const em = emailEl.value.trim();
    if(!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){ showErr("Enter a valid email address."); return null; }
    if(!passEl.value || passEl.value.length < 6){ showErr("Enter your password (at least 6 characters)."); return null; }
    return { email: em, password: passEl.value };
  }

  async function doSignIn(){
    msg.style.display="none";
    const c = validCreds(); if(!c) return;
    const btn = document.getElementById("bw-auth-signin");
    if(btn){ btn.disabled = true; btn.textContent = "Signing in…"; }
    try {
      if(!window.BW_AUTH || !window.BW_AUTH.signIn){
        showErr("Sign-in is still loading. Check your connection and try again.");
        return;
      }
      await window.BW_AUTH.signIn(c.email, c.password);
    } catch(e){ showErr(e.message || "Sign in failed"); }
    finally {
      if(btn){ btn.disabled = false; btn.textContent = "Sign In"; }
    }
  }
  function openCreateAccountLocal(){
    const p = document.getElementById("create-account-page");
    const m = document.getElementById("ca-msg");
    if(m){ m.style.display = "none"; m.textContent = ""; }
    const em = document.getElementById("bw-auth-email");
    const caEm = document.getElementById("ca-email");
    if(em && caEm && em.value) caEm.value = em.value.trim();
    if(gate) gate.style.display = "none";
    if(p) p.style.display = "flex";
    syncAuthScreenBodyClass();
  }
  function openSignup(){
    if(typeof window.openCreateAccount === "function") window.openCreateAccount();
    else openCreateAccountLocal();
  }
  async function doForgot(){
    msg.style.display="none";
    const em = emailEl.value.trim();
    if(!em) return showErr("Enter your email above first, then tap Forgot password.");
    if(!window.BW_AUTH || !window.BW_AUTH.resetPassword){
      showErr("Sign-in is still loading. Check your connection and try again.");
      return;
    }
    try {
      await window.BW_AUTH.resetPassword(em);
      showResetSentBanner();
    } catch(err){ showErr(err?.message || "Could not send reset email."); }
  }

  const AUTH_ACTION_SEL = "#bw-auth-signin,#bw-auth-signup,#bw-auth-forgot";
  const AUTH_ACTIONS = {
    "bw-auth-signin": doSignIn,
    "bw-auth-signup": openSignup,
    "bw-auth-forgot": doForgot,
  };
  // One shared debounce: the same tap can arrive via inline onclick, the element
  // listener, and the coordinate fallback below.
  let _lastAuthAction = 0;
  function runAuthAction(id, e){
    const fn = AUTH_ACTIONS[id];
    if(!fn) return;
    if(e){ e.preventDefault(); e.stopPropagation(); }
    const now = Date.now();
    if(now - _lastAuthAction < 600) return;
    _lastAuthAction = now;
    fn();
  }
  window.bwAuthGateSignIn = (e) => runAuthAction("bw-auth-signin", e);
  window.bwAuthGateOpenSignup = (e) => runAuthAction("bw-auth-signup", e);
  window.bwAuthGateForgot = (e) => runAuthAction("bw-auth-forgot", e);
  if(!window.closeCreateAccount){
    window.closeCreateAccount = function(){
      const p = document.getElementById("create-account-page");
      if(p) p.style.display = "none";
      const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
      if(!u) enforceAuthGate();
      else syncAuthScreenBodyClass();
    };
  }
  Object.keys(AUTH_ACTIONS).forEach((id) => {
    const el = document.getElementById(id);
    if(el) el.addEventListener("click", (e) => runAuthAction(id, e));
  });
  // iOS fallback: if the WebView routes the touch to a scroll layer instead of the
  // button, recover the intended target from the touch coordinates.
  if(gate){
    gate.addEventListener("touchend", (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      if(!t) return;
      const direct = e.target && e.target.closest && e.target.closest(AUTH_ACTION_SEL);
      let hit = direct;
      if(!hit){
        const at = document.elementFromPoint(t.clientX, t.clientY);
        hit = at && at.closest ? at.closest(AUTH_ACTION_SEL) : null;
      }
      if(hit) runAuthAction(hit.id, e);
    }, { passive: false });
  }
  // Let the user submit with Enter from either the email or password field,
  // instead of forcing a click on the Sign In button.
  [emailEl, passEl].forEach((el) => {
    if(!el) return;
    el.addEventListener("keydown", (e) => {
      if(e.key === "Enter"){ e.preventDefault(); doSignIn(); }
    });
  });
  syncAuthScreenBodyClass();
})();
