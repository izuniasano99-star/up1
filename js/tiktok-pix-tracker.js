/**
 * Script para disparar InitiateCheckout quando PIX é criado
 * 
 * Funciona igual ao código da raiz: monitora quando PIX é criado
 * e dispara InitiateCheckout diretamente, sem depender de interceptação
 */

(function() {
  'use strict';

  console.log('🚀 TikTok PIX Tracker iniciando (Magic)...');
  console.log('🔍 Interceptações serão aplicadas AGORA...');

  // Função para disparar InitiateCheckout (igual ao código da raiz)
  function dispararInitiateCheckout(transactionId, amount, customerData, tentativa = 0) {
    const maxTentativas = 5;
    const delay = tentativa === 0 ? 500 : 1000; // Primeira tentativa mais rápida

    setTimeout(function() {
      console.log(`🔍 Tentativa ${tentativa + 1} de disparar InitiateCheckout...`);

      // Verifica se a função existe
      if (typeof window.trackTikTokInitiateCheckout !== "function") {
        console.warn("⚠️ trackTikTokInitiateCheckout ainda não está disponível");
        if (tentativa < maxTentativas) {
          dispararInitiateCheckout(transactionId, amount, customerData, tentativa + 1);
        } else {
          console.error(
            "❌ Não foi possível carregar trackTikTokInitiateCheckout após",
            maxTentativas,
            "tentativas"
          );
        }
        return;
      }

      // Verifica estado do pixel
      console.log("📊 Estado do TikTok Pixel:", {
        ttqExiste: typeof window.ttq !== "undefined",
        ttqTipo: typeof window.ttq,
        ttqIsArray: Array.isArray(window.ttq),
        ttqTrack: typeof window.ttq?.track,
        ttqReady: typeof window.ttq?.ready,
      });

      console.log("🎯 Disparando InitiateCheckout com dados:", {
        transactionId: transactionId,
        amount: amount,
        contentId: "tiktokpay_magic",
      });

      // Dispara o evento usando a função wrapper
      try {
        window.trackTikTokInitiateCheckout({
          transactionId: transactionId,
          amount: amount || 21.67,
          customer: customerData || {
            email: null,
            phone: null,
            name: null,
            document: null,
          },
          contentId: "tiktokpay_magic",
        });
        console.log("✅ InitiateCheckout disparado com sucesso!");
      } catch (error) {
        console.error("❌ Erro ao disparar InitiateCheckout:", error);
        if (tentativa < maxTentativas) {
          dispararInitiateCheckout(transactionId, amount, customerData, tentativa + 1);
        }
      }
    }, delay);
  }

  // Função para extrair dados do cliente
  function getClienteData() {
    // Tenta recuperar do localStorage primeiro
    let clienteNome = null;
    let clienteEmail = null;
    let clienteDocumento = null;
    let clienteTelefone = null;

    try {
      const storedData = localStorage.getItem("userPixData");
      if (storedData) {
        const formData = JSON.parse(storedData);
        clienteNome = formData.nome || null;
        clienteEmail = formData.email || null;
        clienteTelefone = formData.telefone || null;
        if (formData.tipoChave === "CPF" && formData.chavePix) {
          clienteDocumento = formData.chavePix.replace(/\D/g, "");
        }
      }
    } catch (e) {
      console.error("Erro ao ler localStorage:", e);
    }

    return {
      nome: clienteNome,
      email: clienteEmail,
      documento: clienteDocumento,
      telefone: clienteTelefone,
    };
  }

  // Monitora quando PIX é criado - Múltiplas estratégias
  let pixCreated = false;

  // ESTRATÉGIA 1: Monitora respostas de fetch/XMLHttpRequest
  console.log('🔧 Aplicando interceptação de fetch...');
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    const options = args[1] || {};
    const method = (options.method || "GET").toUpperCase();

    // Se for POST para payments.php
    if (method === "POST" && typeof url === "string" && url.includes("payments.php")) {
      console.log("🔍 [PIX TRACKER] Detectada requisição POST para payments.php");
      
      return originalFetch.apply(this, args).then((response) => {
        const clonedResponse = response.clone();
        
        clonedResponse.json().then((data) => {
          console.log("📥 [PIX TRACKER] Resposta recebida:", data);
          
          // Verifica se PIX foi criado com sucesso
          if (data.success === true && (data.transactionId || data.paymentInfo?.transactionId || data.id)) {
            const transactionId = data.transactionId || data.paymentInfo?.transactionId || data.id;
            const amount = data.value || (data.paymentInfo?.amount ? data.paymentInfo.amount / 100 : null) || 21.67;
            
            // Tenta obter dados do payload
            let customerData = {
              email: null,
              phone: null,
              name: null,
              document: null,
            };
            
            try {
              if (options.body) {
                const payload = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
                customerData.email = payload.email || null;
                customerData.phone = payload.phone || null;
                customerData.name = payload.payerName || payload.name || null;
                customerData.document = payload.document || payload.cpf || null;
              }
            } catch (e) {
              // Ignora erro
            }
            
            // Se não tiver dados, tenta do localStorage
            if (!customerData.email && !customerData.name) {
              const cliente = getClienteData();
              customerData.email = cliente.email;
              customerData.name = cliente.nome;
              customerData.document = cliente.documento;
              customerData.phone = cliente.telefone;
            }
            
            if (!pixCreated && transactionId) {
              pixCreated = true;
              console.log("✅ [PIX TRACKER] PIX criado detectado! TransactionID:", transactionId);
              dispararInitiateCheckout(transactionId, amount, customerData);
              
              // Inicia verificação de pagamento (igual raiz)
              console.log("🚀 [PIX TRACKER] Chamando iniciarVerificacaoPagamento...", transactionId);
              iniciarVerificacaoPagamento(transactionId, amount, customerData);
            }
          }
        }).catch((err) => {
          console.error("❌ [PIX TRACKER] Erro ao processar resposta:", err);
        });
        
        return response;
      });
    }
    
    return originalFetch.apply(this, args);
  };

  // ESTRATÉGIA 2: Monitora XMLHttpRequest
  console.log('🔧 Aplicando interceptação de XMLHttpRequest...');
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._method = method.toUpperCase();
    this._url = url;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    const method = this._method || "GET";
    const url = this._url || "";

    if (method === "POST" && typeof url === "string" && url.includes("payments.php")) {
      console.log("🔍 [PIX TRACKER] Detectada requisição XHR POST para payments.php");
      
      const originalOnreadystatechange = this.onreadystatechange;
      
      this.onreadystatechange = function() {
        if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
          try {
            const responseText = this.responseText;
            const data = JSON.parse(responseText);
            
            console.log("📥 [PIX TRACKER] Resposta XHR recebida:", data);
            
            if (data.success === true && (data.transactionId || data.paymentInfo?.transactionId || data.id)) {
              const transactionId = data.transactionId || data.paymentInfo?.transactionId || data.id;
              const amount = data.value || (data.paymentInfo?.amount ? data.paymentInfo.amount / 100 : null) || 21.67;
              
              let customerData = {
                email: null,
                phone: null,
                name: null,
                document: null,
              };
              
              try {
                if (args[0]) {
                  const payload = typeof args[0] === "string" ? JSON.parse(args[0]) : args[0];
                  customerData.email = payload.email || null;
                  customerData.phone = payload.phone || null;
                  customerData.name = payload.payerName || payload.name || null;
                  customerData.document = payload.document || payload.cpf || null;
                }
              } catch (e) {
                // Ignora erro
              }
              
              if (!customerData.email && !customerData.name) {
                const cliente = getClienteData();
                customerData.email = cliente.email;
                customerData.name = cliente.nome;
                customerData.document = cliente.documento;
                customerData.phone = cliente.telefone;
              }
              
            if (!pixCreated && transactionId) {
              pixCreated = true;
              console.log("✅ [PIX TRACKER] PIX criado detectado via XHR! TransactionID:", transactionId);
              dispararInitiateCheckout(transactionId, amount, customerData);
              
              // Inicia verificação de pagamento (igual raiz)
              console.log("🚀 [PIX TRACKER] Chamando iniciarVerificacaoPagamento...", transactionId);
              iniciarVerificacaoPagamento(transactionId, amount, customerData);
            }
            }
          } catch (e) {
            console.error("❌ [PIX TRACKER] Erro ao processar resposta XHR:", e);
          }
        }
        
        if (originalOnreadystatechange) {
          originalOnreadystatechange.apply(this, arguments);
        }
      };
    }
    
    return originalXHRSend.apply(this, args);
  };

  // ESTRATÉGIA 3: Monitora DOM para QR Code
  const observer = new MutationObserver(function(mutations) {
    if (pixCreated) return; // Já processou
    
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) {
          // Procura por QR Code
          const qrCode = node.querySelector && (
            node.querySelector('[id*="qrcode"]') ||
            node.querySelector('[class*="qrcode"]') ||
            node.querySelector('[id*="qr-code"]') ||
            node.querySelector('[class*="qr-code"]') ||
            node.querySelector('img[src*="qr"]') ||
            node.querySelector('canvas')
          );
          
          if (qrCode || (node.id && node.id.includes('qrcode')) || (node.className && node.className.includes('qrcode'))) {
            console.log("🔍 [PIX TRACKER] QR Code detectado no DOM!");
            
            setTimeout(function() {
              // Tenta encontrar transactionId
              let transactionId = null;
              
              // Procura em atributos data
              const transactionElement = document.querySelector('[data-transaction-id], [data-transactionId]');
              if (transactionElement) {
                transactionId = transactionElement.getAttribute('data-transaction-id') || 
                               transactionElement.getAttribute('data-transactionId');
              }
              
              // Procura em variáveis globais
              if (!transactionId && window.transactionId) {
                transactionId = window.transactionId;
              }
              
              // Procura em texto da página
              if (!transactionId) {
                const bodyText = document.body.innerText || document.body.textContent || '';
                const match = bodyText.match(/TXN-[\w-]+/i) || bodyText.match(/transaction[_-]?id[:\s]+([\w-]+)/i);
                if (match) {
                  transactionId = match[1] || match[0];
                }
              }
              
              if (transactionId && !pixCreated) {
                pixCreated = true;
                const cliente = getClienteData();
                console.log("✅ [PIX TRACKER] PIX criado detectado via DOM! TransactionID:", transactionId);
                const customerData = {
                  email: cliente.email,
                  phone: cliente.telefone,
                  name: cliente.nome,
                  document: cliente.documento,
                };
                dispararInitiateCheckout(transactionId, 21.67, customerData);
                
                // Inicia verificação de pagamento (igual raiz)
                console.log("🚀 [PIX TRACKER] Chamando iniciarVerificacaoPagamento...", transactionId);
                iniciarVerificacaoPagamento(transactionId, 21.67, customerData);
              }
            }, 1000);
          }
        }
      });
    });
  });

  // Inicia observação
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

  // Função para verificar pagamento (igual raiz)
  function verificarPagamento(transactionId) {
    console.log("📤 Verificando pagamento:", {
      url: "../production/payments.php?transactionId=" + transactionId,
      transactionId: transactionId,
    });

    if (typeof window.verifyPayment === "function") {
      return window.verifyPayment(transactionId, null)
        .then((data) => {
          console.log("📥 Resposta da verificação:", data);
          return data;
        })
        .catch((error) => {
          console.error("❌ Erro ao verificar pagamento:", error);
          throw error;
        });
    }
    
    // Fallback se verifyPayment não estiver disponível
    const verifyUrl = "../production/payments.php?transactionId=" + encodeURIComponent(transactionId);
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
  }

  // Função para verificar se está pago (igual raiz)
  function isPaymentPaid(data) {
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
  }

  // Função para iniciar verificação de pagamento (igual raiz)
  let checkPaymentInterval = null;
  function iniciarVerificacaoPagamento(transactionId, amount, customerData) {
    console.log("🔍 [VERIFICAÇÃO] Iniciando verificação de pagamento para:", transactionId);
    console.log("🔍 [VERIFICAÇÃO] Parâmetros recebidos:", { transactionId, amount, customerData });

    // Primeira verificação imediata
    verificarPagamento(transactionId)
      .then((data) => {
        console.log("✅ Primeira verificação:", data);

        if (isPaymentPaid(data)) {
          handlePaymentConfirmed(transactionId, amount, customerData);
          return;
        }

        // Continua verificando a cada 8 segundos
        checkPaymentInterval = setInterval(() => {
          verificarPagamento(transactionId)
            .then((data) => {
              console.log("🔄 Verificando pagamento:", data);

              if (isPaymentPaid(data)) {
                clearInterval(checkPaymentInterval);
                handlePaymentConfirmed(transactionId, amount, customerData);
              }
            })
            .catch((error) => {
              console.error("❌ Erro na verificação:", error);
            });
        }, 8000);
      })
      .catch((error) => {
        console.error("❌ Erro na primeira verificação:", error);
        // Tenta novamente após 8 segundos mesmo com erro
        checkPaymentInterval = setInterval(() => {
          verificarPagamento(transactionId)
            .then((data) => {
              console.log("🔄 Verificando pagamento:", data);

              if (isPaymentPaid(data)) {
                clearInterval(checkPaymentInterval);
                handlePaymentConfirmed(transactionId, amount, customerData);
              }
            })
            .catch((error) => {
              console.error("❌ Erro na verificação:", error);
            });
        }, 8000);
      });
  }

  // Função para lidar com pagamento confirmado (igual raiz)
  function handlePaymentConfirmed(transactionId, amount, customerData) {
    console.log("🎉 Pagamento confirmado! Disparando Purchase...", transactionId);

    // Disparar evento Purchase do TikTok Pixel
    if (typeof window.trackTikTokPurchase === "function") {
      const defaultEmail = "fabioonofre81@gmail.com";
      const defaultPhone = "84996733457";
      const defaultName = "Fábio Onofre de Oliveira";
      const defaultDocument = "08993537461";

      console.log("🎯 Disparando Purchase...");
      window.trackTikTokPurchase({
        transactionId: transactionId,
        amount: amount || 21.67,
        customer: {
          email: customerData?.email || defaultEmail,
          phone: customerData?.phone || defaultPhone,
          name: customerData?.name || defaultName,
          document: customerData?.document || defaultDocument,
        },
        contentId: "tiktokpay_magic",
      });
    } else {
      console.warn("⚠️ trackTikTokPurchase não está disponível!");
    }

    // Redirecionamento após pagamento confirmado
    const path = window.location.pathname;
    let redirectUrl = null;
    
    // Recupera UTMs do localStorage para passar no redirecionamento
    let utmParams = {};
    try {
      const utmsStr = localStorage.getItem('utm_params_persistent');
      if (utmsStr) {
        const utms = JSON.parse(utmsStr);
        if (utms.utm_source) utmParams.utm_source = utms.utm_source;
        if (utms.utm_medium) utmParams.utm_medium = utms.utm_medium;
        if (utms.utm_campaign) utmParams.utm_campaign = utms.utm_campaign;
        if (utms.utm_term) utmParams.utm_term = utms.utm_term;
        if (utms.utm_content) utmParams.utm_content = utms.utm_content;
        if (utms.ttclid) utmParams.ttclid = utms.ttclid;
      }
    } catch (e) {
      console.warn('Erro ao recuperar UTMs do localStorage:', e);
    }

    const utmString = new URLSearchParams(utmParams).toString();

    // Determina redirecionamento baseado na origem
    if (path.includes('/checkout') && !path.includes('/up')) {
      // Checkout raiz → UP1
      redirectUrl = '/up1/index.html' + (utmString ? '?' + utmString : '');
    } else if (path.includes('/up1/checkout')) {
      // UP1 checkout → UP2
      redirectUrl = '/up2/index.html' + (utmString ? '?' + utmString : '');
    } else if (path.includes('/up2/checkout')) {
      // UP2 checkout → UP3
      redirectUrl = '/up3/index.html' + (utmString ? '?' + utmString : '');
    } else if (path.includes('/up3/checkout')) {
      // UP3 checkout → UP4
      redirectUrl = '/up4/index.html' + (utmString ? '?' + utmString : '');
    } else if (path.includes('/up4/checkout')) {
      // UP4 checkout → UP5
      redirectUrl = '/up5/index.html' + (utmString ? '?' + utmString : '');
    } else if (path.includes('/up5/checkout')) {
      // UP5 checkout → UP6
      redirectUrl = '/up6/index.html' + (utmString ? '?' + utmString : '');
    } else if (path.includes('/up6/checkout')) {
      // UP6 checkout → Página de sucesso ou fim do funil
      redirectUrl = '/up6/index.html' + (utmString ? '?' + utmString : '');
    }

    // Faz o redirecionamento após 1.5 segundos
    if (redirectUrl) {
      console.log('🔄 Redirecionando para:', redirectUrl);
      setTimeout(() => {
        window.location.href = redirectUrl;
      }, 1500);
    }
  }

  console.log('✅ TikTok PIX Tracker carregado (Magic)');
})();

