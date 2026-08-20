/* Bluewater Intel — Stripe billing + entitlement glue
 * Extracted verbatim from an inline <script> block in index.html (Approach A).
 * Loaded as a plain classic <script src> at the SAME document position, so
 * execution order, global scope, and file:// offline all behave identically.
 * DO NOT reorder relative to the other bw-*.js tags. */

(function(){
  // ── Client billing glue (talks to the deployed stripe-checkout / stripe-portal
  //    edge functions). Entitlements are written by the webhook and read back via
  //    refreshEntitlement(); the client never grants access on its own. ──────────
  function sb(){ return window.BW_AUTH && window.BW_AUTH._sb; }
  function fnBase(){
    const cfg = window.BW_SUPABASE_CONFIG || window.BW_DATA_CONFIG || {};
    return ((cfg.supabaseUrl || cfg.url || "https://mealpzwbjamkjdrsszqe.supabase.co").replace(/\/$/,"")) + "/functions/v1";
  }
  async function authHeaders(){
    const s = sb(); if(!s) throw new Error("Not ready");
    const { data:{ session } } = await s.auth.getSession();
    if(!session) throw new Error("Sign in required.");
    const cfg = window.BW_SUPABASE_CONFIG || {};
    return { "Content-Type":"application/json", Authorization:`Bearer ${session.access_token}`, apikey: cfg.supabaseAnonKey || "" };
  }
  function openBillingUrl(url){
    if(window.BW_CAPACITOR && window.BW_CAPACITOR.openExternalUrl) return window.BW_CAPACITOR.openExternalUrl(url);
    window.location.href = url;
  }
  function billingReturnUrl(query){
    const q = String(query || "").replace(/^\?/, "");
    if(window.BW_NATIVE) return "com.bluewaterintel.app://?" + q;
    const origin = (typeof location !== "undefined" && location.origin) ? location.origin : "https://app.bluewaterintel.com";
    return origin + "/?" + q;
  }
  window.bwSubscribe = async function(interval, opts){
    const msg = document.getElementById("pricing-msg") || document.getElementById("plan-gate-msg");
    const showErr = (t) => { if(msg){ msg.textContent = t; msg.style.display = "block"; msg.style.color = "#fca5a5"; } };
    if(window.BW_NATIVE && window.BW_IAP && window.BW_IAP.available){
      try {
        await window.BW_IAP.purchase(interval);
        closePricing();
        if(typeof window.closePostSignupPlans === "function") window.closePostSignupPlans();
        if(typeof showToast === "function") showToast("Pro unlocked — tight lines!", "success");
        if(typeof window.renderNavPlan === "function") window.renderNavPlan();
      } catch(e){
        if(e && (e.userCancelled || /cancel/i.test(String(e.message||"")))) return;
        showErr(e.message || "Purchase could not be completed.");
      }
      return;
    }
    const kind = "subscription";
    const intervalKey = interval === "year" ? "year" : "month";
    return window.bwCheckout(kind, { interval: intervalKey, ...(opts||{}) });
  };
  window.openPricing = async function(){
    const m = document.getElementById("pricing-modal"); if(!m) return;
    const msg = document.getElementById("pricing-msg"); if(msg) msg.style.display="none";
    if(typeof adaptPricingForNative === "function") await adaptPricingForNative();
    m.style.display = "flex";
  };
  window.closePricing = function(){ const m=document.getElementById("pricing-modal"); if(m) m.style.display="none"; };

  window.markPlanSelected = async function(){
    try {
      const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
      if(u) localStorage.setItem("bwi_plan_selected_" + u.id, new Date().toISOString());
    } catch(e){ /* non-fatal */ }
    try {
      const s = sb();
      const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
      if(!s || !u) return;
      await s.from("profiles").update({ plan_selected_at: new Date().toISOString() }).eq("id", u.id);
    } catch(e){ console.warn("markPlanSelected", e); }
  };
  function planSelectedLocally(uid){
    if(!uid) return false;
    try { return !!localStorage.getItem("bwi_plan_selected_" + uid); } catch(e){ return false; }
  }
  window.needsPlanOnboarding = async function(){
    try {
      const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
      if(!u) return false;
      // Already picked Free / Pro once on this device — never re-prompt.
      if(planSelectedLocally(u.id)) return false;
      // Offline (common in Download My Trip / airplane mode): don't block the app
      // waiting on a profile read that can't succeed. They chose a plan when online.
      if(typeof navigator !== "undefined" && navigator.onLine === false) return false;
      const s = sb();
      if(!s) return false;
      const { data:p, error } = await s.from("profiles")
        .select("plan_selected_at, is_owner, subscription_status")
        .maybeSingle();
      if(error) return false;
      if(!p) return true;
      if(p.plan_selected_at){
        try { localStorage.setItem("bwi_plan_selected_" + u.id, p.plan_selected_at); } catch(e){}
        return false;
      }
      if(p.is_owner) return false;
      if(p.subscription_status === "active" || p.subscription_status === "trialing") return false;
      return true;
    } catch(e){ return false; }
  };

  // One-time plan selection after the user's first confirmed sign-in.
  window.openPostSignupPlans = async function(){
    if(typeof navigator !== "undefined" && navigator.onLine === false) return;
    const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
    if(u && planSelectedLocally(u.id)) return;
    const g = document.getElementById("plan-gate");
    const m = document.getElementById("plan-gate-msg");
    if(m) m.style.display = "none";
    if(typeof adaptPricingForNative === "function") await adaptPricingForNative();
    const auth = document.getElementById("bw-auth-gate");
    const signedIn = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
    if(auth) auth.style.display = signedIn ? "none" : "flex";
    if(g) g.style.display = "flex";
  };
  // ── Create account page ──────────────────────────────────────────────────
  window.openCreateAccount = function(){
    const p = document.getElementById("create-account-page");
    const m = document.getElementById("ca-msg"); if(m){ m.style.display="none"; m.textContent=""; }
    // Prefill email if they typed it on the sign-in screen
    const em = document.getElementById("bw-auth-email");
    const caEm = document.getElementById("ca-email");
    if(em && caEm && em.value) caEm.value = em.value.trim();
    if(p) p.style.display = "flex";
  };
  window.closeCreateAccount = function(){
    const p = document.getElementById("create-account-page"); if(p) p.style.display = "none";
  };
  // Dedicated "check your email to verify" screen shown after signup, so the
  // user isn't dropped on the login form before they've confirmed (which caused
  // an "invalid login credentials" error when they tried to sign in early).
  window.showVerifyEmailScreen = function(email){
    const p = document.getElementById("verify-email-page");
    const addr = document.getElementById("verify-email-addr");
    const msg = document.getElementById("verify-email-msg");
    if(addr) addr.textContent = email || "";
    if(msg){ msg.style.display = "none"; msg.textContent = ""; }
    if(p) p._pendingEmail = email || "";
    if(p) p.style.display = "block";
  };
  window.verifyEmailContinue = function(){
    const p = document.getElementById("verify-email-page"); if(p) p.style.display = "none";
    // Take them to the sign-in screen; they'll sign in after confirming.
    if(typeof showGate === "function") showGate();
  };
  window.resendVerificationEmail = async function(){
    const page = document.getElementById("verify-email-page");
    const msg = document.getElementById("verify-email-msg");
    const btn = document.getElementById("verify-email-resend");
    const email = (page && page._pendingEmail) || (document.getElementById("verify-email-addr")?.textContent || "").trim();
    const show = (text, ok) => {
      if(!msg) return;
      msg.style.display = "block";
      msg.textContent = text;
      msg.style.color = ok ? "#86efac" : "#fca5a5";
    };
    if(!email){ show("Missing email address. Go back and create your account again.", false); return; }
    if(!window.BW_AUTH || !window.BW_AUTH.resendSignupConfirmation){
      show("Sign-in service not ready. Refresh and try again.", false);
      return;
    }
    if(btn){ btn.disabled = true; btn.textContent = "Sending…"; }
    try {
      await window.BW_AUTH.resendSignupConfirmation(email);
      show("Verification email sent — check your inbox and spam folder.", true);
    } catch(e){
      const m = e?.message || String(e);
      if(/rate limit|too many|after \d+ seconds/i.test(m)){
        show("Please wait a minute before requesting another email.", false);
      } else {
        show(m || "Could not resend. Try again in a minute.", false);
      }
    } finally {
      if(btn){ btn.disabled = false; btn.textContent = "Resend verification email"; }
    }
  };
  window.openPasswordRecoveryModal = function(){
    const p = document.getElementById("password-recovery-page");
    const m = document.getElementById("pw-recovery-msg");
    const gate = document.getElementById("bw-auth-gate");
    const newEl = document.getElementById("pw-recovery-new");
    const confirmEl = document.getElementById("pw-recovery-confirm");
    if(m){ m.style.display = "none"; m.textContent = ""; }
    if(newEl) newEl.value = "";
    if(confirmEl) confirmEl.value = "";
    if(gate) gate.style.display = "none";
    if(p) p.style.display = "flex";
  };
  window.closePasswordRecoveryModal = function(){
    const p = document.getElementById("password-recovery-page");
    if(p) p.style.display = "none";
  };
  window.submitPasswordRecovery = async function(){
    const msg = document.getElementById("pw-recovery-msg");
    const show = (text, ok) => {
      if(!msg) return;
      msg.style.display = "block";
      msg.textContent = text;
      msg.style.color = ok ? "#86efac" : "#fca5a5";
    };
    const newPw = (document.getElementById("pw-recovery-new").value || "");
    const confirmPw = (document.getElementById("pw-recovery-confirm").value || "");
    if(!newPw || newPw.length < 6){ show("Password must be at least 6 characters.", false); return; }
    if(newPw !== confirmPw){ show("Passwords do not match.", false); return; }
    if(!window.BW_AUTH || !window.BW_AUTH.updatePassword){
      show("Sign-in service not ready. Refresh the page and try again.", false);
      return;
    }
    try {
      await window.BW_AUTH.updatePassword(newPw);
      window.closePasswordRecoveryModal();
      const gate = document.getElementById("bw-auth-gate");
      if(gate) gate.style.display = "none";
    } catch(e){
      show(e?.message || "Could not update password. Request a new reset link and try again.", false);
    }
  };
  window.submitCreateAccount = async function(){
    const msg = document.getElementById("ca-msg");
    const show = (t) => { if(msg){ msg.style.display="block"; msg.textContent=t; } };
    const name = (document.getElementById("ca-name").value || "").trim();
    const email = (document.getElementById("ca-email").value || "").trim();
    const pass = document.getElementById("ca-password").value || "";
    const agreed = document.getElementById("ca-terms").checked;
    if(!name){ show("Enter your name."); return; }
    if(!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ show("Enter a valid email address."); return; }
    if(!pass || pass.length < 6){ show("Password must be at least 6 characters."); return; }
    if(!agreed){ show("Please agree to the Terms & Conditions and Privacy Policy to continue."); return; }
    const btn = document.getElementById("ca-submit");
    if(btn){ btn.disabled = true; btn.textContent = "Creating account…"; }
    try {
      // Pass the name + T&C acceptance timestamp as user metadata so the account
      // record captures consent. BW_AUTH.signUp forwards metadata to Supabase.
      const meta = { full_name: name, tos_accepted_at: new Date().toISOString() };
      const res = await window.BW_AUTH.signUp(email, pass, meta);
      closeCreateAccount();
      // With email confirmation ON, the user must verify before they have a
      // usable session. Do NOT drop them on the sign-in form (they'd try to log
      // in and hit "invalid login credentials" because they haven't confirmed).
      // Show a dedicated "check your email" welcome screen instead.
      if(typeof window.showVerifyEmailScreen === "function"){
        window.showVerifyEmailScreen(email);
      } else {
        showGate();
        const gmsg = document.getElementById("bw-auth-msg");
        if(gmsg){ gmsg.style.display="block"; gmsg.style.color="#86efac";
          gmsg.textContent = `Account created! Check your email (${email}) for a verification link, then sign in.`; }
      }
    } catch(e){
      show(e && e.message ? e.message : "Could not create account. Try again.");
    } finally {
      if(btn){ btn.disabled = false; btn.textContent = "Create Account"; }
    }
  };

  // ── Account management page ──────────────────────────────────────────────
  window.openAccountPage = function(){
    if(typeof closeNav === "function") closeNav();
    const page = document.getElementById("account-page");
    if(!page) return;
    // Fill profile
    let acct = (typeof USER_PREFS !== "undefined") ? USER_PREFS.account : null;
    if((!acct || !acct.name) && window.BW_AUTH && window.BW_AUTH.getUser){
      const u = window.BW_AUTH.getUser();
      if(u) acct = { name: (u.user_metadata && u.user_metadata.full_name) || (u.email ? u.email.split("@")[0] : "Captain"), email: u.email || "" };
    }
    const name = (acct && acct.name) || "Captain";
    const email = (acct && acct.email) || "";
    const av = document.getElementById("acct-avatar"); if(av) av.textContent = (name[0]||"?").toUpperCase();
    const nm = document.getElementById("acct-name"); if(nm) nm.textContent = name;
    const em = document.getElementById("acct-email"); if(em) em.textContent = email;
    // Fill plan section based on entitlement
    const label = document.getElementById("acct-plan-label");
    const detail = document.getElementById("acct-plan-detail");
    const actions = document.getElementById("acct-plan-actions");
    const paid = (typeof BW_PREMIUM !== "undefined") && BW_PREMIUM === true;
    const badgeStyle = "flex:1;text-align:center;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.45);color:#86efac;font-size:12px;font-weight:700;padding:10px 12px;border-radius:8px";
    if(label && detail && actions){
      let planLabel = "Free", planDetail = "You're on the free version — maps, ports, catches, and your own waypoints. Upgrade to Pro to unlock the Bite Map, ocean intel, waypoints, and the AI Captain's Brief.";
      let actionsHtml = `<button class="bw-buy" type="button" style="flex:1;background:#16a34a;border-color:rgba(134,239,172,.55)" onclick="closeAccountPage();openPricing()">Upgrade to Pro</button>`;
      const fillPlan = (p) => {
        const st = p && p.subscription_status;
        const interval = p && p.subscription_interval;
        if(p && p.is_owner){
          planLabel = "Owner";
          planDetail = "Full access · unlimited";
          actionsHtml = `<span style="${badgeStyle}">Owner</span>`;
        } else if(st === "active"){
          planLabel = interval === "year" ? "PRO Annual" : "PRO Monthly";
          planDetail = "Full app — Bite Map, ocean & weather layers, all waypoints, fishing reports, and up to 2 AI Captain's Briefs per day.";
          actionsHtml = `<span style="${badgeStyle}">${planLabel}</span><button class="bw-buy" type="button" style="flex:1" onclick="bwManageBilling()">Manage Billing</button>`;
        } else if(st === "trialing"){
          planLabel = "7 Day Trial";
          planDetail = "Full app · all waypoints · 1 free AI Captain's Brief for the trial";
          actionsHtml = `<span style="${badgeStyle}">7 Day Trial</span><button class="bw-buy" type="button" style="flex:1" onclick="bwManageBilling()">Upgrade/Cancel</button>`;
        } else if(paid){
          planLabel = "Pro";
          planDetail = "Full app — Bite Map, ocean & weather layers, all waypoints, fishing reports, and up to 2 AI Captain's Briefs per day.";
          actionsHtml = `<button class="bw-buy" type="button" style="flex:1" onclick="bwManageBilling()">Manage Billing</button>`;
        }
      };
      try {
        const s = sb();
        if(s){
          s.from("profiles").select("is_owner, subscription_status, subscription_interval").maybeSingle()
            .then(({ data:p }) => { fillPlan(p); label.textContent = planLabel; detail.textContent = planDetail; actions.innerHTML = actionsHtml; })
            .catch(() => { if(paid){ fillPlan(null); label.textContent = planLabel; detail.textContent = planDetail; actions.innerHTML = actionsHtml; } });
        } else if(paid){
          fillPlan(null);
        }
      } catch(e){
        if(paid) fillPlan(null);
      }
      label.textContent = planLabel;
      detail.textContent = planDetail;
      actions.innerHTML = actionsHtml;
    }
    const dmsg = document.getElementById("acct-delete-msg"); if(dmsg){ dmsg.style.display="none"; dmsg.textContent=""; }
    page.style.display = "block";
  };
  window.closeAccountPage = function(){
    const page = document.getElementById("account-page");
    if(page) page.style.display = "none";
  };
  // Manage Billing → opens the Stripe customer portal (backend returns a URL).
  window.bwManageBilling = async function(){
    try {
      const res = await fetch(`${fnBase()}/stripe-portal`, { method:"POST", headers: await authHeaders() });
      const j = await res.json();
      if(j && j.url){ window.location.href = j.url; return; }
      throw new Error((j && j.error) || "Could not open billing portal.");
    } catch(e){
      if(typeof showToast === "function") showToast(e.message || "Billing portal unavailable.", "error");
    }
  };
  // Account deletion — two-step confirm, then calls the backend delete endpoint.
  window.deleteAccountFlow = async function(){
    const msg = document.getElementById("acct-delete-msg");
    const show = (t,color) => { if(msg){ msg.style.display="block"; msg.style.color=color||"#cbd5e1"; msg.textContent=t; } };
    const ok = window.confirm("Permanently delete your account and all your data? This cannot be undone.");
    if(!ok) return;
    const typed = window.prompt('This is permanent. Type DELETE to confirm.');
    if(!typed || typed.trim().toUpperCase() !== "DELETE"){ show("Deletion cancelled.", "#9ec5e8"); return; }
    show("Deleting your account…", "#9ec5e8");
    try {
      const res = await fetch(`${fnBase()}/delete-account`, { method:"POST", headers: await authHeaders() });
      if(!res.ok){ const j = await res.json().catch(()=>({})); throw new Error(j.error || `Delete failed (${res.status})`); }
      // Sign out locally and reload to the signed-out state.
      try { if(window.BW_AUTH && window.BW_AUTH.signOut) await window.BW_AUTH.signOut(); } catch(e){}
      show("Account deleted. Signing you out…", "#86efac");
      setTimeout(()=>{ try { location.reload(); } catch(e){} }, 1200);
    } catch(e){
      show(e.message || "Could not delete account. If you have an active subscription, cancel it first from Manage Billing.", "#f87171");
    }
  };

  window.closePostSignupPlans = function(){
    const g = document.getElementById("plan-gate"); if(g) g.style.display = "none";
    const auth = document.getElementById("bw-auth-gate"); if(auth) auth.style.display = "none";
    if(typeof hideGate === "function"){ try { hideGate(); } catch(e){} }
    if(typeof window.markPlanSelected === "function") window.markPlanSelected();
    // After first plan choice, show the one-time click-through tour if needed.
    try {
      const u = window.BW_AUTH && window.BW_AUTH.getUser && window.BW_AUTH.getUser();
      if(u && typeof maybeShowFirstLoginOnboarding === "function") maybeShowFirstLoginOnboarding(u);
    } catch(e){}
  };
  window.bwSignOutFromPlanGate = async function(){
    try { if(window.BW_AUTH && window.BW_AUTH.signOut) await window.BW_AUTH.signOut(); } catch(e){}
    window.closePostSignupPlans();
    // Fall back to a reload so auth state resets cleanly to the sign-in screen.
    try { location.reload(); } catch(e){}
  };
  window.bwCheckout = async function(kind, opts){
    const msg = document.getElementById("pricing-msg") || document.getElementById("plan-gate-msg");
    try {
      const body = {
        kind,
        ...(opts||{}),
        success_url: billingReturnUrl("checkout=success"),
        cancel_url: billingReturnUrl("checkout=cancel"),
      };
      const res = await fetch(`${fnBase()}/stripe-checkout`, { method:"POST", headers: await authHeaders(), body: JSON.stringify(body) });
      const j = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(j.error || `Checkout failed (${res.status})`);
      if(j.url) openBillingUrl(j.url);
    } catch(e){
      const text = e.message || "Could not start checkout.";
      if(msg){ msg.textContent = text; msg.style.display="block"; msg.style.color = "#fca5a5"; }
      else if(typeof showToast === "function") showToast(text, "error");
    }
  };
  window.bwManageBilling = async function(){
    const msg = document.getElementById("pricing-msg");
    if(window.BW_NATIVE){
      try {
        const s = sb();
        if(s){
          const { data:p } = await s.from("profiles").select("billing_source, subscription_status").maybeSingle();
          if(p && p.billing_source === "stripe" && ["active","trialing"].includes(p.subscription_status)){
            const note = "You subscribed on our website. Manage billing at app.bluewaterintel.com in Safari.";
            if(msg){ msg.textContent = note; msg.style.display = "block"; }
            else if(typeof showToast === "function") showToast(note, "info");
            return;
          }
        }
        if(window.BW_IAP && window.BW_IAP.openAppStoreSubscriptions) window.BW_IAP.openAppStoreSubscriptions();
      } catch(e){
        if(window.BW_IAP && window.BW_IAP.openAppStoreSubscriptions) window.BW_IAP.openAppStoreSubscriptions();
      }
      return;
    }
    try {
      const body = { return_url: billingReturnUrl("portal=return") };
      const res = await fetch(`${fnBase()}/stripe-portal`, { method:"POST", headers: await authHeaders(), body: JSON.stringify(body) });
      const j = await res.json();
      if(!res.ok) throw new Error(j.error || "Could not open billing portal.");
      if(j.url) openBillingUrl(j.url);
    } catch(e){ if(msg){ msg.textContent = e.message || "Could not open billing portal."; msg.style.display="block"; } }
  };
  // Renders the plan status + Upgrade/Manage buttons inside the nav account block.
  window.renderNavPlan = async function(){
    const el = document.getElementById("nav-plan"); if(!el) return;
    let tier = "Free", detail = "Maps, ports, catches & your own waypoints";
    let st = "none", interval = null, isOwner = false;
    try {
      const s = sb();
      if(s){
        const { data:p } = await s.from("profiles").select("is_owner, subscription_status, subscription_interval").maybeSingle();
        st = (p && p.subscription_status) || "none";
        interval = p && p.subscription_interval;
        isOwner = !!(p && p.is_owner);
        if(isOwner){ tier="Owner"; detail="Full access · unlimited"; }
        else if(st==="active"){ tier="Pro"; detail="Full app · all waypoints · 2 AI briefs/day"; }
        else if(st==="trialing"){ tier="7 Day Trial"; detail="Full app · all waypoints · 1 free AI brief"; }
      }
    } catch(e){ /* show free */ }
    const badgeStyle = "font-family:inherit;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.45);color:#86efac;font-size:11px;font-weight:700;padding:7px 12px;border-radius:7px;white-space:nowrap;text-align:center";
    let actionHtml = `<button type="button" onclick="openPricing()" style="font-family:inherit;background:#2979b5;border:none;color:#fff;font-size:11px;font-weight:700;padding:7px 12px;border-radius:7px;cursor:pointer">Upgrade</button>`;
    if(isOwner){
      actionHtml = `<span style="${badgeStyle}">Owner</span>`;
    } else if(st==="active"){
      const planLabel = interval === "year" ? "PRO Annual" : "PRO Monthly";
      actionHtml = `<span style="${badgeStyle}">${planLabel}</span>`;
    } else if(st==="trialing"){
      actionHtml = `<span style="${badgeStyle}">7 Day Trial</span>`;
    }
    const showManage = !isOwner && (st==="active" || st==="trialing");
    const manageLabel = st==="trialing" ? "Upgrade/Cancel" : "Manage";
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(7,17,33,.5);border:1px solid rgba(107,191,234,.18);border-radius:9px;padding:8px 10px">
        <div style="min-width:0">
          <div style="font-size:11px;color:#9ec5e8">Plan</div>
          <div style="font-size:13px;font-weight:700;color:#f0f6ff">${tier}</div>
          <div style="font-size:10px;color:#7d9bb8;line-height:1.35">${detail}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
          ${actionHtml}
          ${showManage?`<button type="button" onclick="bwManageBilling()" style="font-family:inherit;background:transparent;border:1px solid rgba(107,191,234,.35);color:#6bbfea;font-size:11px;font-weight:600;padding:6px 12px;border-radius:7px;cursor:pointer">${manageLabel}</button>`:""}
        </div>
      </div>`;
  };
  // If returning from a successful Stripe checkout, refresh entitlement shortly
  // after load (webhook may take a second) and clean the URL.
  try {
    const q = new URLSearchParams(location.search);
    if(q.get("checkout")==="success"){
      const clean = location.origin + location.pathname;
      history.replaceState({}, "", clean);
      if(typeof window.markPlanSelected === "function") window.markPlanSelected();
      // After returning from Stripe, the webhook that writes entitlement can lag
      // a few seconds. Re-check entitlement a few times; as soon as the plan is
      // active, drop the plan gate AND the auth gate so the user enters the app.
      const bump = async (n)=>{
        try { if(typeof refreshEntitlement==="function") await refreshEntitlement(); } catch(e){}
        if(typeof renderNavPlan==="function") renderNavPlan();
        const entitled = (typeof BW_PREMIUM !== "undefined") && BW_PREMIUM === true;
        if(entitled){
          if(typeof window.closePostSignupPlans === "function") window.closePostSignupPlans();
          const auth = document.getElementById("bw-auth-gate"); if(auth) auth.style.display = "none";
        } else if(n>0){
          setTimeout(()=>bump(n-1), 2500);
        }
      };
      setTimeout(()=>bump(4), 1500);
    }
  } catch(e){}
})();

// iOS/Android: swap Stripe checkout copy for App Store billing on native builds.
window.BW_LEGAL_URLS = {
  terms: "https://app.bluewaterintel.com/terms.html",
  privacy: "https://app.bluewaterintel.com/privacy.html",
  support: "https://app.bluewaterintel.com/support.html",
  appleEula: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
};

window.bwOpenLegalUrl = function(url){
  if(window.BW_CAPACITOR && window.BW_CAPACITOR.openExternalUrl) return window.BW_CAPACITOR.openExternalUrl(url);
  window.open(url, "_blank", "noopener");
};

function bwLegalLinksHtml(){
  const u = window.BW_LEGAL_URLS || {};
  const link = (href, label) =>
    `<a href="#" onclick="event.preventDefault();bwOpenLegalUrl('${href}')" style="color:#7dd3fc;text-decoration:underline">${label}</a>`;
  return `${link(u.terms, "Terms of Use")} · ${link(u.privacy, "Privacy Policy")} · ${link(u.appleEula, "Apple EULA")}`;
}

function bwAutoRenewDisclosure(){
  return "Payment is charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless canceled at least 24 hours before the end of the current period. Your account is charged for renewal within 24 hours prior to the end of the current period. Manage and cancel in Settings → [your name] → Subscriptions.";
}

function applyNativeProductLabels(products){
  const fmt = (p, fallback) => {
    if(!p) return fallback;
    const price = p.priceString || p.localizedPriceString || p.price_string;
    const period = (p.subscriptionPeriod || p.subscription_period || "").toLowerCase();
    if(price && /year|annual|12/.test(period)) return `${price}/year`;
    if(price && /month/.test(period)) return `${price}/month`;
    return price ? price : fallback;
  };
  const monthlyBtn = document.getElementById("pricing-monthly-btn");
  const annualBtn = document.getElementById("pricing-annual-btn");
  const planMonthlyBtn = document.getElementById("plan-gate-monthly-btn");
  const planAnnualBtn = document.getElementById("plan-gate-annual-btn");
  const mLabel = fmt(products && products.monthly, "Monthly");
  const yLabel = fmt(products && products.annual, "Annual");
  if(monthlyBtn) monthlyBtn.textContent = `Bluewater Intel Pro — 1 month · ${mLabel}`;
  if(annualBtn) annualBtn.textContent = `Bluewater Intel Pro — 1 year · ${yLabel}`;
  if(planMonthlyBtn) planMonthlyBtn.textContent = `Bluewater Intel Pro — 1 month · ${mLabel}`;
  if(planAnnualBtn) planAnnualBtn.textContent = `Bluewater Intel Pro — 1 year · ${yLabel}`;
}

window.bwRestorePurchases = async function(){
  const msg = document.getElementById("pricing-msg") || document.getElementById("plan-gate-msg");
  const show = (t, ok) => {
    if(!msg) return;
    msg.textContent = t;
    msg.style.display = "block";
    msg.style.color = ok ? "#86efac" : "#fca5a5";
  };
  if(!window.BW_IAP || !window.BW_IAP.restore){
    show("Restore is only available in the iOS app.", false);
    return;
  }
  try {
    await window.BW_IAP.restore();
    if(window.BW_PREMIUM){
      show("Purchases restored — Pro is active.", true);
      closePricing();
      if(typeof window.closePostSignupPlans === "function") window.closePostSignupPlans();
    } else {
      show("No active App Store subscription found for this account.", false);
    }
  } catch(e){
    show(e.message || "Could not restore purchases.", false);
  }
};

window.adaptPricingForNative = async function(){
  if(!window.BW_NATIVE) return;
  const trialBlocks = document.querySelectorAll(".bw-stripe-trial-block");
  trialBlocks.forEach(el => { el.style.display = "none"; });
  const stripeLinks = document.querySelectorAll(".bw-stripe-only");
  stripeLinks.forEach(el => { el.style.display = "none"; });

  const note = document.getElementById("pricing-checkout-note");
  if(note){
    note.innerHTML = `<div style="margin-bottom:8px">${bwAutoRenewDisclosure()}</div>`
      + `<div>${bwLegalLinksHtml()}</div>`;
  }
  const planNote = document.getElementById("plan-gate-checkout-note");
  if(planNote){
    planNote.innerHTML = `<div style="margin-bottom:8px">${bwAutoRenewDisclosure()}</div>`
      + `<div>${bwLegalLinksHtml()}</div>`;
  }
  const manage = document.getElementById("pricing-manage-link");
  if(manage){
    manage.textContent = "Manage subscription in App Store settings";
    manage.onclick = (e) => {
      e.preventDefault();
      if(window.BW_IAP && window.BW_IAP.openAppStoreSubscriptions) window.BW_IAP.openAppStoreSubscriptions();
    };
  }

  if(window.BW_IAP && window.BW_IAP.loadProducts){
    try {
      const products = await window.BW_IAP.loadProducts();
      if(products && !products.error) applyNativeProductLabels(products);
    } catch(e){ /* fall back to static button labels */ }
  }
};
if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", () => { if(typeof adaptPricingForNative === "function") adaptPricingForNative(); });
} else if(typeof adaptPricingForNative === "function"){
  adaptPricingForNative();
}
