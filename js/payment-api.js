/**
 * API centralizada para verificação de pagamento - MagicPay
 *
 * Este arquivo pode ser incluído na página de checkout
 * e sempre usará os endpoints centralizados
 */

(function () {
  "use strict";

  // Detecta o caminho base baseado na estrutura de pastas
  function getBasePath() {
    // Para checkout/, o payments.php está em ../production/
    return "../production/";
  }

  const BASE_PATH = getBasePath();

  /**
   * Verifica o status de um pagamento
   * @param {string} transactionId - ID da transação
   * @param {string|null} paymentId - ID do pagamento (opcional)
   * @returns {Promise} Promise com os dados do pagamento
   */
  window.verifyPayment = function (transactionId, paymentId = null) {
    const urlParams = new URLSearchParams(window.location.search);
    const utmParams = {};

    // Captura parâmetros UTM
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
    ].forEach((key) => {
      if (urlParams.has(key)) {
        utmParams[key] = urlParams.get(key);
      }
    });

    // MagicPay usa GET com query string
    let verifyUrl = BASE_PATH + "payments.php?transactionId=" + encodeURIComponent(transactionId);
    
    // Adiciona UTMs na URL se existirem
    if (Object.keys(utmParams).length > 0) {
      const utmString = new URLSearchParams(utmParams).toString();
      verifyUrl += "&" + utmString;
    }

    console.log("📤 Verificando pagamento:", {
      url: verifyUrl,
      transactionId: transactionId,
    });

    return fetch(verifyUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        if (!response.ok) {
          return response.text().then((text) => {
            throw new Error(`HTTP ${response.status}: ${text}`);
          });
        }
        return response.json();
      })
      .then((data) => {
        console.log("📥 Resposta da verificação:", data);
        return data;
      })
      .catch((error) => {
        console.error("❌ Erro ao verificar pagamento:", error);
        throw error;
      });
  };

  /**
   * Verifica se o pagamento está pago
   * @param {Object} data - Dados retornados pela verificação
   * @returns {boolean}
   */
  window.isPaymentPaid = function (data) {
    return (
      data.paid === true ||
      data.status === "completed" ||
      data.status === "COMPLETED" ||
      data.status === "paid" ||
      data.status === "PAID" ||
      data.status === "approved" ||
      data.status === "APPROVED" ||
      data.status === "confirmado" ||
      data.status === "CONFIRMADO" ||
      data.status === "aprovado" ||
      data.status === "APROVADO" ||
      data.status === "pago" ||
      data.status === "PAGO"
    );
  };

  /**
   * Identifica qual produto baseado na URL
   * @returns {string} Identificador do produto ('magic')
   */
  function identifyProductFromUrl() {
    const path = window.location.pathname;
    if (path.includes("/magic/")) {
      return "magic";
    }
    return "magic"; // fallback
  }

  /**
   * Extrai ttclid da URL ou de outras fontes
   * @returns {string|null} TikTok Click ID ou null
   */
  function getTtclidFromUrl() {
    // 1. Tenta da URL atual
    const urlParams = new URLSearchParams(window.location.search);
    let ttclid = urlParams.get("ttclid") || urlParams.get("click_id") || null;

    // 2. Se não encontrou na URL, tenta do localStorage (pode ter sido salvo anteriormente)
    if (!ttclid) {
      try {
        const storedUtm = localStorage.getItem("utm_params");
        if (storedUtm) {
          const utmData = JSON.parse(storedUtm);
          ttclid = utmData.ttclid || utmData.click_id || null;
        }
      } catch (e) {
        // Ignora erros de parsing
      }
    }

    // 3. Tenta do sessionStorage também
    if (!ttclid) {
      try {
        const sessionUtm = sessionStorage.getItem("utm_params");
        if (sessionUtm) {
          const utmData = JSON.parse(sessionUtm);
          ttclid = utmData.ttclid || utmData.click_id || null;
        }
      } catch (e) {
        // Ignora erros de parsing
      }
    }

    return ttclid;
  }

  /**
   * Mapeia identificador de produto para content_id do TikTok
   * @param {string} productIdentifier - Identificador do produto
   * @returns {string} Content ID do TikTok
   */
  function getContentIdForProduct(productIdentifier) {
    const productMap = {
      magic: "tiktokpay_magic",
    };
    return productMap[productIdentifier] || "tiktokpay_magic";
  }

  /**
   * Função para hash SHA-256 (para dados PII)
   * @param {string} message - Mensagem para hash
   * @returns {Promise<string>} Hash SHA-256 em hexadecimal
   */
  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hashHex;
  }

  /**
   * Identifica usuário com dados PII (hash SHA-256)
   * @param {Object} options - Opções do evento
   * @param {string} [options.email] - Email do cliente (será hasheado)
   * @param {string} [options.phone_number] - Telefone do cliente (será hasheado)
   * @param {string} [options.external_id] - ID externo do cliente (será hasheado)
   */
  window.trackTikTokIdentify = async function (options) {
    // Garante que ttq existe (pode ser array ou objeto)
    if (typeof window.ttq === "undefined") {
      window.ttq = [];
    }

    const identifyData = {};

    if (options.email) {
      try {
        identifyData.email = await sha256(options.email.toLowerCase().trim());
      } catch (error) {
        console.error("Erro ao fazer hash do email:", error);
      }
    }

    if (options.phone_number) {
      try {
        // Remove caracteres não numéricos antes de fazer hash
        const phone = options.phone_number.replace(/\D/g, "");
        identifyData.phone_number = await sha256(phone);
      } catch (error) {
        console.error("Erro ao fazer hash do telefone:", error);
      }
    }

    if (options.external_id) {
      try {
        identifyData.external_id = await sha256(
          String(options.external_id).trim()
        );
      } catch (error) {
        console.error("Erro ao fazer hash do external_id:", error);
      }
    }

    if (Object.keys(identifyData).length > 0) {
      // Função para disparar o identify
      function dispatchIdentify() {
        if (
          typeof window.ttq !== "undefined" &&
          typeof window.ttq.identify === "function"
        ) {
          window.ttq.identify(identifyData);
          console.log("✅ TikTok Identify enviado:", identifyData);
        } else {
          // Se identify não existe ainda, adiciona à fila
          window.ttq.push(["identify", identifyData]);
          console.log("✅ TikTok Identify adicionado à fila:", identifyData);
        }
      }

      // Tenta usar ready() se disponível, senão dispara diretamente
      if (
        typeof window.ttq !== "undefined" &&
        typeof window.ttq.ready === "function"
      ) {
        window.ttq.ready(function () {
          dispatchIdentify();
        });
      } else {
        // Dispara diretamente (funciona tanto na fila quanto quando carregado)
        dispatchIdentify();
      }
    }
  };

  /**
   * Mapeia content_id para content_name (nome do produto)
   * @param {string} contentId - Content ID do produto
   * @returns {string} Nome do produto
   */
  function getContentNameForProduct(contentId) {
    const nameMap = {
      tiktokpay_magic: "Taxa de confirmação de identidade",
    };
    return nameMap[contentId] || "Taxa de confirmação de identidade";
  }

  /**
   * Aguarda o pixel TikTok estar completamente carregado
   * @param {number} maxWait - Tempo máximo de espera em ms (padrão: 5000ms)
   * @returns {Promise} Promise que resolve quando o pixel está carregado
   */
  function waitForTikTokPixel(maxWait = 5000) {
    return new Promise(function (resolve, reject) {
      const startTime = Date.now();

      function checkPixel() {
        // Verifica se o script do pixel foi carregado
        const scriptLoaded = document.querySelector(
          'script[src*="analytics.tiktok.com/i18n/pixel/events.js"]'
        );

        // Verifica se ttq.track está disponível como função
        const trackAvailable =
          typeof window.ttq !== "undefined" &&
          typeof window.ttq.track === "function";

        if (trackAvailable || scriptLoaded) {
          console.log("✅ Pixel TikTok detectado como carregado");
          resolve();
          return;
        }

        // Verifica timeout
        if (Date.now() - startTime > maxWait) {
          console.warn(
            "⚠️ Timeout aguardando pixel TikTok, mas continuando mesmo assim..."
          );
          resolve(); // Resolve mesmo assim para não bloquear
          return;
        }

        // Tenta novamente após 100ms
        setTimeout(checkPixel, 100);
      }

      checkPixel();
    });
  }

  /**
   * Dispara evento InitiateCheckout do TikTok Pixel via navegador
   * @param {Object} options - Opções do evento
   * @param {string} options.transactionId - ID da transação
   * @param {number} options.amount - Valor em reais
   * @param {Object} options.customer - Dados do cliente {email, phone, name, document}
   * @param {string} [options.contentId] - Content ID do produto (opcional, será detectado automaticamente)
   * @param {string} [options.contentName] - Nome do produto (opcional, será detectado automaticamente)
   */
  window.trackTikTokInitiateCheckout = function (options) {
    // Garante que ttq existe (pode ser array ou objeto)
    if (typeof window.ttq === "undefined") {
      window.ttq = [];
    }

    // Identifica produto automaticamente se não fornecido
    const productIdentifier = identifyProductFromUrl();
    const contentId =
      options.contentId || getContentIdForProduct(productIdentifier);
    const contentName =
      options.contentName || getContentNameForProduct(contentId);

    // Captura ttclid para incluir no evento
    const ttclid = getTtclidFromUrl();

    const eventData = {
      contents: [
        {
          content_id: contentId,
          content_type: "product",
          content_name: contentName,
        },
      ],
      value: parseFloat(options.amount) || 0,
      currency: options.currency || "BRL",
    };

    // Adiciona ttclid se disponível (TikTok Pixel aceita propriedades customizadas)
    if (ttclid) {
      eventData.properties = eventData.properties || {};
      eventData.properties.ttclid = ttclid;
      console.log("🔗 ttclid incluído no InitiateCheckout:", ttclid);
    } else {
      console.warn("⚠️ ttclid não encontrado na URL ou storage");
    }

    console.log("📊 Disparando TikTok InitiateCheckout:", eventData);
    console.log("🔍 Estado do ttq:", {
      existe: typeof window.ttq !== "undefined",
      tipo: typeof window.ttq,
      temTrack: typeof window.ttq.track,
      temReady: typeof window.ttq.ready,
      isArray: Array.isArray(window.ttq),
    });

    // Função para disparar o evento
    function dispatchEvent() {
      try {
        // Verifica se ttq.track é uma função (pixel carregou)
        if (
          typeof window.ttq !== "undefined" &&
          typeof window.ttq.track === "function"
        ) {
          // Pixel carregou, usa track() diretamente
          window.ttq.track("InitiateCheckout", eventData);
          console.log(
            "✅ TikTok InitiateCheckout enviado via track():",
            eventData
          );
          console.log("✅ Verifique no Pixel Helper se o evento apareceu!");
          return true;
        } else if (Array.isArray(window.ttq)) {
          // Pixel ainda não carregou, adiciona à fila
          window.ttq.push(["track", "InitiateCheckout", eventData]);
          console.log(
            "✅ TikTok InitiateCheckout adicionado à fila (será processado quando pixel carregar):",
            eventData
          );
          console.log("📋 Fila atual:", window.ttq);
          return true;
        } else {
          // Caso especial: ttq existe mas não é array nem tem track
          console.warn(
            "⚠️ ttq existe mas não tem formato esperado, tentando push..."
          );
          if (typeof window.ttq.push === "function") {
            window.ttq.push(["track", "InitiateCheckout", eventData]);
            console.log(
              "✅ TikTok InitiateCheckout adicionado via push():",
              eventData
            );
            return true;
          } else {
            // Último recurso: tenta criar array e adicionar
            window.ttq = window.ttq || [];
            window.ttq.push(["track", "InitiateCheckout", eventData]);
            console.log(
              "✅ TikTok InitiateCheckout adicionado (fallback):",
              eventData
            );
            return true;
          }
        }
      } catch (error) {
        console.error("❌ Erro ao disparar InitiateCheckout:", error);
        console.error("Stack:", error.stack);
        // Fallback: tenta adicionar à fila mesmo com erro
        try {
          if (typeof window.ttq === "undefined") {
            window.ttq = [];
          }
          window.ttq.push(["track", "InitiateCheckout", eventData]);
          console.log(
            "✅ TikTok InitiateCheckout adicionado à fila (fallback após erro):",
            eventData
          );
          return true;
        } catch (e) {
          console.error("❌ Erro crítico ao adicionar à fila:", e);
          return false;
        }
      }
    }

    // Estratégia múltipla para garantir que o evento seja disparado
    let eventDispatched = false;

    // 1. Primeiro, adiciona à fila imediatamente (sempre funciona)
    console.log("⚡ Adicionando evento à fila imediatamente...");
    eventDispatched = dispatchEvent();

    // 2. Aguarda pixel carregar e tenta disparar diretamente
    waitForTikTokPixel(3000).then(function () {
      // Tenta usar ready() se disponível
      if (
        typeof window.ttq !== "undefined" &&
        typeof window.ttq.ready === "function"
      ) {
        console.log("⏳ Aguardando pixel carregar via ready()...");
        window.ttq.ready(function () {
          console.log(
            "✅ Pixel carregado via ready()! Disparando evento diretamente..."
          );
          // Dispara diretamente também para garantir
          if (
            typeof window.ttq !== "undefined" &&
            typeof window.ttq.track === "function"
          ) {
            try {
              window.ttq.track("InitiateCheckout", eventData);
              console.log(
                "✅ InitiateCheckout disparado diretamente via track()!"
              );
            } catch (e) {
              console.error("❌ Erro ao disparar diretamente:", e);
            }
          }
        });
      } else {
        // Se ready() não existe, tenta disparar diretamente se track() estiver disponível
        if (
          typeof window.ttq !== "undefined" &&
          typeof window.ttq.track === "function"
        ) {
          try {
            window.ttq.track("InitiateCheckout", eventData);
            console.log(
              "✅ InitiateCheckout disparado diretamente via track()!"
            );
          } catch (e) {
            console.error("❌ Erro ao disparar diretamente:", e);
          }
        }
      }
    });

    // Se tem dados do cliente, também identifica
    if (options.customer) {
      window.trackTikTokIdentify({
        email: options.customer.email,
        phone_number: options.customer.phone,
        external_id: options.customer.document,
      });
    }
  };

  /**
   * Dispara evento Purchase do TikTok Pixel via navegador
   * @param {Object} options - Opções do evento
   * @param {string} options.transactionId - ID da transação
   * @param {number} options.amount - Valor em reais
   * @param {Object} [options.customer] - Dados do cliente {email, phone, name, document}
   * @param {string} [options.contentId] - Content ID do produto (opcional, será detectado automaticamente)
   * @param {string} [options.contentName] - Nome do produto (opcional, será detectado automaticamente)
   */
  window.trackTikTokPurchase = function (options) {
    // Garante que ttq existe (pode ser array ou objeto)
    if (typeof window.ttq === "undefined") {
      window.ttq = [];
    }

    // Identifica produto automaticamente se não fornecido
    const productIdentifier = identifyProductFromUrl();
    const contentId =
      options.contentId || getContentIdForProduct(productIdentifier);
    const contentName =
      options.contentName || getContentNameForProduct(contentId);

    // Captura ttclid para incluir no evento
    const ttclid = getTtclidFromUrl();

    const eventData = {
      contents: [
        {
          content_id: contentId,
          content_type: "product",
          content_name: contentName,
        },
      ],
      value: parseFloat(options.amount) || 0,
      currency: options.currency || "BRL",
    };

    // Adiciona ttclid se disponível (TikTok Pixel aceita propriedades customizadas)
    if (ttclid) {
      eventData.properties = eventData.properties || {};
      eventData.properties.ttclid = ttclid;
      console.log("🔗 ttclid incluído no Purchase:", ttclid);
    } else {
      console.warn("⚠️ ttclid não encontrado na URL ou storage");
    }

    console.log("📊 Disparando TikTok Purchase:", eventData);
    console.log("🔍 Estado do ttq:", {
      existe: typeof window.ttq !== "undefined",
      tipo: typeof window.ttq,
      temTrack: typeof window.ttq.track,
      temReady: typeof window.ttq.ready,
      isArray: Array.isArray(window.ttq),
    });

    // Função para disparar o evento
    function dispatchEvent() {
      try {
        // Se ttq.track existe como função, usa diretamente
        if (
          typeof window.ttq !== "undefined" &&
          typeof window.ttq.track === "function"
        ) {
          window.ttq.track("Purchase", eventData);
          console.log("✅ TikTok Purchase enviado via track():", eventData);
          console.log("✅ Verifique no Pixel Helper se o evento apareceu!");
          return true;
        } else {
          // Se não, adiciona à fila (funciona quando pixel ainda não carregou)
          window.ttq.push(["track", "Purchase", eventData]);
          console.log("✅ TikTok Purchase adicionado à fila:", eventData);
          return true;
        }
      } catch (error) {
        console.error("❌ Erro ao disparar Purchase:", error);
        // Fallback: tenta adicionar à fila mesmo com erro
        try {
          window.ttq.push(["track", "Purchase", eventData]);
          console.log(
            "✅ TikTok Purchase adicionado à fila (fallback):",
            eventData
          );
          return true;
        } catch (e) {
          console.error("❌ Erro crítico ao adicionar à fila:", e);
          return false;
        }
      }
    }

    // Estratégia múltipla para garantir que o evento seja disparado
    let eventDispatched = false;

    // Verifica se o pixel já está carregado
    const pixelJaCarregado =
      typeof window.ttq !== "undefined" &&
      typeof window.ttq.track === "function";

    if (pixelJaCarregado) {
      // Pixel já está carregado - dispara diretamente imediatamente
      console.log("⚡ Pixel já carregado! Disparando Purchase diretamente...");
      eventDispatched = dispatchEvent();
    } else {
      // Pixel ainda não carregou - adiciona à fila primeiro
      console.log(
        "⚡ Pixel ainda não carregou. Adicionando Purchase à fila..."
      );
      eventDispatched = dispatchEvent();

      // Aguarda pixel carregar e dispara diretamente também para garantir
      waitForTikTokPixel(2000).then(function () {
        if (
          typeof window.ttq !== "undefined" &&
          typeof window.ttq.track === "function"
        ) {
          try {
            window.ttq.track("Purchase", eventData);
            console.log(
              "✅ Purchase disparado diretamente após pixel carregar!"
            );
          } catch (e) {
            console.error("❌ Erro ao disparar após carregar:", e);
          }
        }
      });
    }

    // Se tem dados do cliente, também identifica
    if (options.customer) {
      window.trackTikTokIdentify({
        email: options.customer.email,
        phone_number: options.customer.phone,
        external_id: options.customer.document,
      });
    }
  };

  console.log("✅ Payment API carregada. Base path:", BASE_PATH);
})();

