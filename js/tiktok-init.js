/**
 * Wrapper para interceptar criação de PIX e disparar InitiateCheckout
 * 
 * Intercepta chamadas fetch POST para production/payments.php
 * e dispara evento TikTok InitiateCheckout quando PIX é criado com sucesso
 */

(function () {
  "use strict";

  console.log("🚀 TikTok Init wrapper INICIANDO (Magic)...");

  // Função para extrair parâmetros UTM da URL
  function getUtmParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const utmParams = {};

    const utmFields = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "click_id",
      "fbclid",
      "gclid",
      "msclkid",
      "ttclid",
    ];

    utmFields.forEach((param) => {
      if (urlParams.has(param)) {
        utmParams[param] = urlParams.get(param);
      }
    });

    // Salva UTM params no localStorage para preservar após redirecionamentos
    if (Object.keys(utmParams).length > 0) {
      try {
        localStorage.setItem("utm_params", JSON.stringify(utmParams));
      } catch (e) {
        console.warn("⚠️ Erro ao salvar UTM params no localStorage:", e);
      }
    }

    return utmParams;
  }

  // Função para processar resposta de criação de PIX
  function processPixCreationResponse(data, transactionId, amount, customerData, utmParams) {
    console.log("📥 Resposta da criação de PIX:", data);

    // Verifica se PIX foi criado com sucesso
    if (
      data.success === true &&
      transactionId &&
      (data.paymentInfo?.qrCode || data.qrCode || data.pixCode || data.pix_code || data.paymentInfo?.pixCode || data.qrcode)
    ) {
      console.log("✅ PIX criado com sucesso! Disparando InitiateCheckout...");
      console.log("   TransactionID:", transactionId);
      console.log("   Amount:", amount);

      // Dispara InitiateCheckout
      if (typeof window.trackTikTokInitiateCheckout === "function") {
        window.trackTikTokInitiateCheckout({
          transactionId: transactionId,
          amount: amount || 0,
          customer: customerData,
          contentId: "tiktokpay_magic",
        });
      } else {
        console.warn(
          "⚠️ trackTikTokInitiateCheckout não está disponível ainda. Tentando novamente em 500ms..."
        );
        setTimeout(() => {
          if (typeof window.trackTikTokInitiateCheckout === "function") {
            window.trackTikTokInitiateCheckout({
              transactionId: transactionId,
              amount: amount || 0,
              customer: customerData,
              contentId: "tiktokpay_magic",
            });
          } else {
            console.error(
              "❌ trackTikTokInitiateCheckout ainda não está disponível após retry"
            );
          }
        }, 500);
      }

      // Salva UTMs vinculados ao transactionId
      if (transactionId) {
        const utmQuery = JSON.stringify(utmParams);

        fetch("../production/save-utm-query.php", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transactionId: transactionId,
            utmQuery: utmQuery,
            customer: customerData,
          }),
        })
          .then((response) => response.json())
          .then((result) => {
            console.log("✅ UTMs salvos:", result);
          })
          .catch((err) => {
            console.error("❌ Erro ao salvar UTMs:", err);
            // Não interrompe o fluxo se falhar
          });
      }
    } else {
      console.log("⚠️ PIX não foi criado ou resposta inválida:", data);
    }
  }

  // Intercepta fetch para capturar criação de PIX
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const url = args[0];
    const options = args[1] || {};
    const method = (options.method || "GET").toUpperCase();

    // Log TODAS as requisições POST para debug
    if (method === "POST") {
      console.log("🔍 [FETCH] Requisição POST detectada:", {
        url: url,
        method: method,
        includesPayments: typeof url === "string" && url.includes("payments"),
        urlType: typeof url
      });
    }

    // Verifica se é POST para production/payments.php (aceita várias variações de URL)
    const isPaymentsUrl = typeof url === "string" && (
      url.includes("production/payments.php") ||
      url.includes("payments.php") ||
      url.match(/payments\.php/i)
    );

    if (isPaymentsUrl && method === "POST") {
      console.log("🔍 ✅ Interceptando criação de PIX!");
      console.log("   URL:", url);
      console.log("   Method:", method);

      // Tenta obter dados do cliente do payload original
      let customerData = {
        email: null,
        phone: null,
        name: null,
        document: null,
      };

      let amount = null;

      // Tenta obter do payload original (se disponível)
      try {
        if (options.body) {
          const payload = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
          customerData.email = payload.email || null;
          customerData.phone = payload.phone || null;
          customerData.name = payload.payerName || payload.name || null;
          customerData.document = payload.document || payload.cpf || null;
          amount = payload.value || payload.amount || null;
          if (amount && amount > 1000) {
            amount = amount / 100; // Converte centavos para reais
          }
        }
      } catch (e) {
        console.warn("⚠️ Não foi possível obter dados do payload:", e);
      }

      const utmParams = getUtmParams();

      // Chama fetch original
      return originalFetch.apply(this, args).then((response) => {
        // Clona a resposta para poder ler o body múltiplas vezes
        const clonedResponse = response.clone();

        // Lê o JSON da resposta
        clonedResponse
          .json()
          .then((data) => {
            const transactionId = data.transactionId || data.transaction_id || data.id;
            
            // Tenta obter amount da resposta se não veio do payload
            if (!amount) {
              amount = data.value || null;
              if (!amount && data.paymentInfo) {
                if (data.paymentInfo.amount) {
                  amount = data.paymentInfo.amount > 1000 ? data.paymentInfo.amount / 100 : data.paymentInfo.amount;
                } else if (data.paymentInfo.value) {
                  amount = data.paymentInfo.value;
                }
              }
            }

            processPixCreationResponse(data, transactionId, amount, customerData, utmParams);
          })
          .catch((error) => {
            console.error("❌ Erro ao processar resposta:", error);
          });

        // Retorna a resposta original
        return response;
      });
    }

    // Para outras requisições, chama fetch original normalmente
    return originalFetch.apply(this, args);
  };

  // Intercepta axios se existir
  if (typeof window.axios !== "undefined") {
    console.log("🔍 Axios detectado! Interceptando também...");
    const originalAxiosPost = window.axios.post;
    const originalAxiosRequest = window.axios.request;

    if (originalAxiosPost) {
      window.axios.post = function (url, data, config) {
        const isPaymentsUrl = typeof url === "string" && (
          url.includes("production/payments.php") ||
          url.includes("payments.php") ||
          url.match(/payments\.php/i)
        );

        if (isPaymentsUrl) {
          console.log("🔍 ✅ Interceptando criação de PIX via axios.post!");
          console.log("   URL:", url);

          let customerData = {
            email: null,
            phone: null,
            name: null,
            document: null,
          };

          let amount = null;

          if (data) {
            customerData.email = data.email || null;
            customerData.phone = data.phone || null;
            customerData.name = data.payerName || data.name || null;
            customerData.document = data.document || data.cpf || null;
            amount = data.value || data.amount || null;
            if (amount && amount > 1000) {
              amount = amount / 100;
            }
          }

          const utmParams = getUtmParams();

          return originalAxiosPost.apply(this, arguments).then((response) => {
            const responseData = response.data || response;
            const transactionId = responseData.transactionId || responseData.transaction_id || responseData.id;

            if (!amount) {
              amount = responseData.value || null;
              if (!amount && responseData.paymentInfo) {
                if (responseData.paymentInfo.amount) {
                  amount = responseData.paymentInfo.amount > 1000 ? responseData.paymentInfo.amount / 100 : responseData.paymentInfo.amount;
                } else if (responseData.paymentInfo.value) {
                  amount = responseData.paymentInfo.value;
                }
              }
            }

            processPixCreationResponse(responseData, transactionId, amount, customerData, utmParams);
            return response;
          });
        }

        return originalAxiosPost.apply(this, arguments);
      };
    }
  }

  // Intercepta XMLHttpRequest se existir (muitos React apps usam isso)
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._method = method.toUpperCase();
    this._url = url;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const method = this._method || "GET";
    const url = this._url || "";

    // Log TODAS as requisições POST para debug
    if (method === "POST") {
      console.log("🔍 [XHR] Requisição POST detectada:", {
        url: url,
        method: method,
        includesPayments: typeof url === "string" && url.includes("payments")
      });
    }

    // Verifica se é POST para payments.php
    const isPaymentsUrl = typeof url === "string" && (
      url.includes("production/payments.php") ||
      url.includes("payments.php") ||
      url.match(/payments\.php/i)
    );

    if (isPaymentsUrl && method === "POST") {
      console.log("🔍 ✅ Interceptando criação de PIX via XMLHttpRequest!");
      console.log("   URL:", url);
      console.log("   Method:", method);

      // Tenta obter dados do payload
      let customerData = {
        email: null,
        phone: null,
        name: null,
        document: null,
      };

      let amount = null;

      try {
        if (args[0]) {
          const payload = typeof args[0] === "string" ? JSON.parse(args[0]) : args[0];
          customerData.email = payload.email || null;
          customerData.phone = payload.phone || null;
          customerData.name = payload.payerName || payload.name || null;
          customerData.document = payload.document || payload.cpf || null;
          amount = payload.value || payload.amount || null;
          if (amount && amount > 1000) {
            amount = amount / 100;
          }
        }
      } catch (e) {
        console.warn("⚠️ Não foi possível obter dados do payload XMLHttpRequest:", e);
      }

      const utmParams = getUtmParams();

      // Intercepta o evento onload
      const originalOnload = this.onload;
      const originalOnreadystatechange = this.onreadystatechange;

      this.onreadystatechange = function () {
        if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
          try {
            const responseText = this.responseText;
            const data = JSON.parse(responseText);
            const transactionId = data.transactionId || data.transaction_id || data.id;

            if (!amount) {
              amount = data.value || null;
              if (!amount && data.paymentInfo) {
                if (data.paymentInfo.amount) {
                  amount = data.paymentInfo.amount > 1000 ? data.paymentInfo.amount / 100 : data.paymentInfo.amount;
                } else if (data.paymentInfo.value) {
                  amount = data.paymentInfo.value;
                }
              }
            }

            processPixCreationResponse(data, transactionId, amount, customerData, utmParams);
          } catch (e) {
            console.error("❌ Erro ao processar resposta XMLHttpRequest:", e);
          }
        }

        // Chama callback original se existir
        if (originalOnreadystatechange) {
          originalOnreadystatechange.apply(this, arguments);
        }
      };

      // Também intercepta onload se existir
      if (originalOnload) {
        this.onload = function () {
          originalOnload.apply(this, arguments);
        };
      }
    }

    return originalXHRSend.apply(this, args);
  };

  // Fallback: Monitora mudanças no DOM para detectar quando PIX é criado
  // Isso funciona mesmo se a interceptação não capturar a requisição
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) { // Element node
          // Procura por elementos que indicam que PIX foi criado
          const qrCode = node.querySelector && (
            node.querySelector('[id*="qrcode"]') ||
            node.querySelector('[class*="qrcode"]') ||
            node.querySelector('[id*="qr-code"]') ||
            node.querySelector('[class*="qr-code"]')
          );
          
          if (qrCode || (node.id && node.id.includes('qrcode')) || (node.className && node.className.includes('qrcode'))) {
            console.log("🔍 QR Code detectado no DOM! Verificando se precisa disparar InitiateCheckout...");
            
            // Aguarda um pouco para garantir que os dados estão disponíveis
            setTimeout(function() {
              // Tenta encontrar transactionId em elementos da página
              const transactionIdElement = document.querySelector('[data-transaction-id], [id*="transaction"], [class*="transaction"]');
              let transactionId = null;
              
              if (transactionIdElement) {
                transactionId = transactionIdElement.getAttribute('data-transaction-id') ||
                              transactionIdElement.textContent?.match(/TXN-[\w-]+/)?.[0] ||
                              transactionIdElement.id?.match(/TXN-[\w-]+/)?.[0];
              }
              
              // Se não encontrou, tenta buscar em variáveis globais ou no window
              if (!transactionId && window.transactionId) {
                transactionId = window.transactionId;
              }
              
              if (transactionId && typeof window.trackTikTokInitiateCheckout === "function") {
                console.log("✅ TransactionId encontrado via DOM! Disparando InitiateCheckout...");
                console.log("   TransactionID:", transactionId);
                
                window.trackTikTokInitiateCheckout({
                  transactionId: transactionId,
                  amount: 21.67, // Valor padrão
                  customer: {
                    email: null,
                    phone: null,
                    name: null,
                    document: null,
                  },
                  contentId: "tiktokpay_magic",
                });
              }
            }, 1000);
          }
        }
      });
    });
  });

  // Inicia observação quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  } else {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Também monitora mensagens do postMessage (alguns React apps usam isso)
  window.addEventListener('message', function(event) {
    if (event.data && typeof event.data === 'object') {
      // Procura por dados de transação nas mensagens
      if (event.data.transactionId || event.data.transaction_id || event.data.id) {
        const transactionId = event.data.transactionId || event.data.transaction_id || event.data.id;
        if (transactionId && typeof window.trackTikTokInitiateCheckout === "function") {
          console.log("🔍 TransactionId detectado via postMessage! Disparando InitiateCheckout...");
          console.log("   TransactionID:", transactionId);
          
          window.trackTikTokInitiateCheckout({
            transactionId: transactionId,
            amount: event.data.amount || event.data.value || 21.67,
            customer: {
              email: event.data.email || null,
              phone: event.data.phone || null,
              name: event.data.name || event.data.payerName || null,
              document: event.data.document || event.data.cpf || null,
            },
            contentId: "tiktokpay_magic",
          });
        }
      }
    }
  });

  console.log("✅ TikTok Init wrapper carregado (Magic)");
  console.log("🔍 Interceptações ativas: fetch, axios, XMLHttpRequest, DOM Observer, postMessage");
})();
