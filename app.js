(function () {
  "use strict";

  const form = document.getElementById("signup-form");
  const submitBtn = document.getElementById("submit-btn");
  const statusEl = document.getElementById("form-status");
  const thanksEl = document.getElementById("thanks");
  const againBtn = document.getElementById("again-btn");

  const endpoint =
    (window.APP_CONFIG && window.APP_CONFIG.GAS_ENDPOINT) || "";

  // フィールドごとのエラー表示をクリア
  function clearErrors() {
    document.querySelectorAll(".error").forEach((el) => (el.textContent = ""));
    statusEl.textContent = "";
    statusEl.className = "form-status";
  }

  function setError(field, message) {
    const el = document.querySelector(`.error[data-error-for="${field}"]`);
    if (el) el.textContent = message;
  }

  // 入力値のバリデーション。エラーがあれば true を返す
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
      setError("grade", "学年・所属を選択してください。");
      hasError = true;
    }

    if (!data.days) {
      setError("days", "参加希望曜日を1つ以上選んでください。");
      hasError = true;
    }

    return hasError;
  }

  function collectData() {
    const days = Array.from(
      form.querySelectorAll('input[name="days"]:checked')
    ).map((el) => el.value);

    return {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      grade: form.grade.value,
      days: days.join("・"),
      goal: form.goal.value.trim(),
    };
  }

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.querySelector(".submit__label").textContent = loading
      ? "送信中..."
      : "この内容で申し込む";
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearErrors();

    const data = collectData();
    if (validate(data)) {
      statusEl.textContent = "入力内容をご確認ください。";
      statusEl.className = "form-status form-status--error";
      return;
    }

    if (!endpoint || endpoint.indexOf("http") !== 0) {
      statusEl.textContent =
        "送信先が未設定です。config.js に Google Apps Script の URL を設定してください。";
      statusEl.className = "form-status form-status--error";
      return;
    }

    setLoading(true);

    try {
      // GAS のウェブアプリはCORSプリフライトを避けるため text/plain で送信する
      await fetch(endpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(data),
      });

      // no-cors のためレスポンス内容は読めないが、送信成功として扱う
      form.hidden = true;
      thanksEl.hidden = false;
      thanksEl.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (err) {
      statusEl.textContent =
        "送信に失敗しました。通信環境をご確認のうえ、もう一度お試しください。";
      statusEl.className = "form-status form-status--error";
    } finally {
      setLoading(false);
    }
  });

  againBtn.addEventListener("click", function () {
    form.reset();
    clearErrors();
    form.hidden = false;
    thanksEl.hidden = true;
    form.name.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
})();
