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
  function hideGate(){ if(gate) gate.style.display="none"; }
  function showGate(){ if(gate) gate.style.display="flex"; }

  async function onSignedIn(user){
    if(typeof USER_PREFS !== "undefined"){
      USER_PREFS.account = {
        name: (user.user_metadata && user.user_metadata.full_name) || (user.email ? user.email.split("@")[0] : "Captain"),
        email: user.email || "",
      };
    }
    if(typeof renderAccountSection === "function") renderAccountSection();
    if(typeof window.bwOnSignedIn === "function"){
      try { await window.bwOnSignedIn(user); } catch(e){ console.error(e); }
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
      if(!planOpen) hideGate();  // don't yank a plan gate the user is actively viewing
      return;
    }
    _planOnboardCheckedFor = user.id;  // set BEFORE awaiting so concurrent re-fires can't double-open
    let showPlan = false;
    try {
      if(typeof window.needsPlanOnboarding === "function") showPlan = await window.needsPlanOnboarding();
    } catch(e){}
    if(showPlan && typeof window.openPostSignupPlans === "function"){
      window.openPostSignupPlans();
      return;
    }
    if(typeof window.closePostSignupPlans === "function") window.closePostSignupPlans();
    hideGate();
    if(typeof maybeShowFirstLoginOnboarding === "function"){
      try { await maybeShowFirstLoginOnboarding(user); } catch(e){}
    }
  }

  function wireAuth(){
    if(!window.BW_AUTH){ setTimeout(wireAuth, 100); return; }
    window.BW_AUTH.onAuthChange(async (user) => {
      if(user) await onSignedIn(user);
      else showGate();
    });
    // Note: we intentionally do NOT hideGate() here on existing session. The
    // onAuthChange handler above runs onSignedIn(), which checks entitlement and
    // either drops the gate (valid plan) or shows the plan picker (no plan yet).
  }
  wireAuth();

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
    try {
      await window.BW_AUTH.signIn(c.email, c.password);
    } catch(e){ showErr(e.message || "Sign in failed"); }
  }
  document.getElementById("bw-auth-signin").addEventListener("click", doSignIn);
  // Let the user submit with Enter from either the email or password field,
  // instead of forcing a click on the Sign In button.
  [emailEl, passEl].forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if(e.key === "Enter"){ e.preventDefault(); doSignIn(); }
    });
  });
  forgotEl.addEventListener("click", async (e) => {
    e.preventDefault();
    msg.style.display="none";
    const em = emailEl.value.trim();
    if(!em) return showErr("Enter your email above first, then tap Forgot password.");
    try {
      await window.BW_AUTH.resetPassword(em);
      showResetSentBanner();
    } catch(err){ showErr(err?.message || "Could not send reset email."); }
  });
  document.getElementById("bw-auth-signup").addEventListener("click", () => {
    if(typeof window.openCreateAccount === "function") window.openCreateAccount();
  });
})();
