(function () {
  "use strict";

  const form = document.getElementById("signup-form");
  const confirmEl = document.getElementById("confirm");
  const reviewEl = document.getElementById("review");
  const thanksEl = document.getElementById("thanks");

  const toConfirmBtn = document.getElementById("to-confirm-btn");
  const backBtn = document.getElementById("back-btn");
  const sendBtn = document.getElementById("send-btn");
  const againBtn = document.getElementById("again-btn");

  const statusEl = document.getElementById("form-status");
  const confirmStatusEl = document.getElementById("confirm-status");
  const steps = document.querySelectorAll(".step");

  const endpoint =
    (window.APP_CONFIG && window.APP_CONFIG.GAS_ENDPOINT) || "";

  // 確認画面に表示する項目（ラベルとキー）
  const REVIEW_FIELDS = [
    { key: "name", label: "お名前" },
    { key: "email", label: "メールアドレス" },
    { key: "grade", label: "学年" },
    { key: "school", label: "学校名" },
    { key: "affiliation", label: "所属" },
  ];

  let currentData = null;

  function clearErrors() {
    document.querySelectorAll(".error").forEach((el) => (el.textContent = ""));
    statusEl.textContent = "";
    statusEl.className = "form-status";
  }

  function setError(field, message) {
    const el = document.querySelector(`.error[data-error-for="${field}"]`);
    if (el) el.textContent = message;
  }

  // 表示中のステップを切り替える（input / confirm / done）
  function goStep(step) {
    form.hidden = step !== "input";
    confirmEl.hidden = step !== "confirm";
    thanksEl.hidden = step !== "done";

    let active = true;
    steps.forEach((el) => {
      el.classList.toggle("is-active", active);
      if (el.dataset.step === step) active = false;
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function collectData() {
    return {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      grade: form.grade.value,
      school: form.school.value.trim(),
      affiliation: form.affiliation.value,
    };
  }

  // 入力チェック。エラーがあれば true を返す
  function validate(data) {
    let hasError = false;

    if (!data.name) {
      setError("name", "お名前を入力してください。");
      hasError = true;
    }
    if (!data.email) {
      setError("email", "メールアドレスを入力してください。");
      hasError = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      setError("email", "メールアドレスの形式が正しくありません。");
      hasError = true;
    }
    if (!data.grade) {
      setError("grade", "学年を選択してください。");
      hasError = true;
    }
    if (!data.school) {
      setError("school", "学校名を入力してください。");
      hasError = true;
    }
    if (!data.affiliation) {
      setError("affiliation", "所属を選択してください。");
      hasError = true;
    }
    return hasError;
  }

  function renderReview(data) {
    reviewEl.innerHTML = "";
    REVIEW_FIELDS.forEach((f) => {
      const dt = document.createElement("dt");
      dt.textContent = f.label;
      const dd = document.createElement("dd");
      dd.textContent = data[f.key] || "（未入力）";
      reviewEl.appendChild(dt);
      reviewEl.appendChild(dd);
    });
  }

  function setSending(sending) {
    sendBtn.disabled = sending;
    backBtn.disabled = sending;
    sendBtn.querySelector(".submit__label").textContent = sending
      ? "送信中..."
      : "送信する";
  }

  // 入力 → 確認
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearErrors();

    const data = collectData();
    if (validate(data)) {
      statusEl.textContent = "入力内容をご確認ください。";
      statusEl.className = "form-status form-status--error";
      return;
    }

    currentData = data;
    renderReview(data);
    confirmStatusEl.textContent = "";
    confirmStatusEl.className = "form-status";
    goStep("confirm");
  });

  // 確認 → 入力（修正）
  backBtn.addEventListener("click", function () {
    goStep("input");
  });

  // 確認 → 送信 → 完了
  sendBtn.addEventListener("click", async function () {
    if (!currentData) return;

    if (!endpoint || endpoint.indexOf("http") !== 0) {
      confirmStatusEl.textContent =
        "送信先が未設定です。config.js に Google Apps Script の URL を設定してください。";
      confirmStatusEl.className = "form-status form-status--error";
      return;
    }

    setSending(true);
    confirmStatusEl.textContent = "";
    confirmStatusEl.className = "form-status";

    try {
      // GAS のウェブアプリはCORSプリフライトを避けるため text/plain で送信する
      await fetch(endpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(currentData),
      });

      goStep("done");
    } catch (err) {
      confirmStatusEl.textContent =
        "送信に失敗しました。通信環境をご確認のうえ、もう一度お試しください。";
      confirmStatusEl.className = "form-status form-status--error";
    } finally {
      setSending(false);
    }
  });

  // 完了 → 最初から
  againBtn.addEventListener("click", function () {
    form.reset();
    clearErrors();
    currentData = null;
    goStep("input");
    form.name.focus();
  });
})();
