(function () {
  "use strict";

  const selectEl = document.getElementById("select");
  const stepsEl = document.getElementById("steps");
  const form = document.getElementById("signup-form");
  const confirmEl = document.getElementById("confirm");
  const reviewEl = document.getElementById("review");
  const thanksEl = document.getElementById("thanks");

  const backBtn = document.getElementById("back-btn");
  const sendBtn = document.getElementById("send-btn");
  const againBtn = document.getElementById("again-btn");
  const toSelectBtn = document.getElementById("to-select-btn");

  const statusEl = document.getElementById("form-status");
  const confirmStatusEl = document.getElementById("confirm-status");
  const steps = document.querySelectorAll(".step");

  const endpoint =
    (window.APP_CONFIG && window.APP_CONFIG.GAS_ENDPOINT) || "";

  // 所属区分（"chishokan" = 智翔館・RED個別 / "other" = その他塾・自治体）
  let path = null;
  let currentData = null;

  // 確認画面に表示する項目（区分ごと）
  const REVIEW_FIELDS = {
    chishokan: [
      { key: "name", label: "お名前" },
      { key: "email", label: "メールアドレス" },
      { key: "grade", label: "学年" },
      { key: "school", label: "学校名" },
      { key: "affiliation", label: "所属" },
    ],
    other: [
      { key: "name", label: "お名前" },
      { key: "email", label: "メールアドレス" },
      { key: "grade", label: "学年" },
      { key: "school", label: "学校名" },
      { key: "affiliation", label: "所属塾" },
      { key: "phone", label: "電話番号" },
    ],
  };

  // 区分に応じて表示・非表示を切り替えるフィールド
  function applyPath(p) {
    document.querySelectorAll("[data-path]").forEach((el) => {
      el.hidden = el.dataset.path !== p;
    });
  }

  function clearErrors() {
    document.querySelectorAll(".error").forEach((el) => (el.textContent = ""));
    statusEl.textContent = "";
    statusEl.className = "form-status";
  }

  function setError(field, message) {
    const el = document.querySelector(`.error[data-error-for="${field}"]`);
    if (el) el.textContent = message;
  }

  // 表示中の画面を切り替える（select / input / confirm / done）
  function goStep(step) {
    selectEl.hidden = step !== "select";
    stepsEl.hidden = step === "select";
    form.hidden = step !== "input";
    confirmEl.hidden = step !== "confirm";
    thanksEl.hidden = step !== "done";

    if (step !== "select") {
      let active = true;
      steps.forEach((el) => {
        el.classList.toggle("is-active", active);
        if (el.dataset.step === step) active = false;
      });
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function collectData() {
    const base = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      grade: form.grade.value,
      school: form.school.value.trim(),
      category: path === "chishokan" ? "智翔館・RED個別" : "その他塾・自治体",
    };

    if (path === "chishokan") {
      base.affiliation = form.affiliation.value;
      base.phone = "";
    } else {
      base.affiliation = form.affiliationText.value.trim();
      base.phone = form.phone.value.trim();
    }
    return base;
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

    if (path === "chishokan") {
      if (!data.affiliation) {
        setError("affiliation", "所属を選択してください。");
        hasError = true;
      }
    } else {
      if (!data.affiliation) {
        setError(
          "affiliationText",
          "所属塾を入力してください。（ない場合は「なし」）"
        );
        hasError = true;
      }
      if (!data.phone) {
        setError("phone", "電話番号を入力してください。");
        hasError = true;
      } else if (!/^[0-9０-９\-ー\s]{8,}$/.test(data.phone)) {
        setError("phone", "電話番号の形式が正しくありません。");
        hasError = true;
      }
    }
    return hasError;
  }

  function renderReview(data) {
    reviewEl.innerHTML = "";
    REVIEW_FIELDS[path].forEach((f) => {
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

  // ⓪ 区分選択
  document.querySelectorAll(".choice").forEach((btn) => {
    btn.addEventListener("click", function () {
      path = btn.dataset.path;
      applyPath(path);
      form.reset();
      clearErrors();
      goStep("input");
      form.name.focus();
    });
  });

  // 入力画面から区分選択に戻る
  toSelectBtn.addEventListener("click", function () {
    goStep("select");
  });

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

  // 完了 → 最初（区分選択）から
  againBtn.addEventListener("click", function () {
    form.reset();
    clearErrors();
    currentData = null;
    path = null;
    goStep("select");
  });
})();
