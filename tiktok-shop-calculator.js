
    // ---------- 初始化默认数据 (基于excel原始参考) ----------
    // 站点列表
    const SITES = [
        { code: "VND", name: "越南", currency: "₫", exchangeRate: 3802, defaultTariff: 0 },
        { code: "THB", name: "泰国", currency: "฿", exchangeRate: 4.7, defaultTariff: 30 },   // 30%
        { code: "MYR", name: "马来", currency: "RM", exchangeRate: 1/1.69, defaultTariff: 0 },
        { code: "PHP", name: "菲律宾", currency: "₱", exchangeRate: 8.65, defaultTariff: 0 },
        { code: "SGD", name: "新加坡", currency: "S$", exchangeRate: 1/5.45, defaultTariff: 0 }
    ];

    // 子费率配置  (百分比数值，存储为百分数，例如13代表13%)
    // 顺序: 佣金, 交易手续费, 增值税, 提现费, 额外A, 额外B
    const defaultSubFees = {
        VND: [13.0, 5.0, 10.0, 1.0, 0, 0],
        THB: [8.56, 3.21, 7.0, 1.0, 0.23, 6.42],   // 基础设施0.23% + 电商增长6.42%
        MYR: [14.58, 3.78, 10.0, 1.0, 0, 0],
        PHP: [6.8, 2.24, 0, 1.0, 5.5, 0],          // 包邮服务费5.5%
        SGD: [3.27, 2.18, 0, 1.0, 9.0, 0]          // 消费税9%
    };

    // 物流价卡 (首重克, 首重当地货币, 续重每10g货币)
    const defaultShipping = {
        VND: { firstGram: 10, firstPrice: 10900, additionalPer10g: 900 },
        THB: { firstGram: 10, firstPrice: 1, additionalPer10g: 1 },
        MYR: { firstGram: 10, firstPrice: 0.15, additionalPer10g: 0.15 },
        PHP: { firstGram: 10, firstPrice: 4.5, additionalPer10g: 4.5 },
        SGD: { firstGram: 40, firstPrice: 0.98, additionalPer10g: 0.15 }
    };

    // 额外单独关税(泰国30%, 其他0)
    let tariffRates = {
        VND: 0,
        THB: 30,
        MYR: 0,
        PHP: 0,
        SGD: 0
    };

    // 汇率 (可修改)
    let exchangeRates = {
        VND: 3802,
        THB: 4.7,
        MYR: 1/1.69,
        PHP: 8.65,
        SGD: 1/5.45
    };

    // 当前选中的站点code
    let currentSite = "VND";

    // 动态费率存储 (百分比数值数组)
    let subFeeRates = JSON.parse(JSON.stringify(defaultSubFees));
    // 物流存储
    let shippingRates = JSON.parse(JSON.stringify(defaultShipping));

    // ---------- 辅助函数 ----------
    function computeTotalFeePercent(siteCode) {
        const fees = subFeeRates[siteCode] || [0,0,0,0,0,0];
        let total = fees.reduce((sum, val) => sum + val, 0);
        return total; // 返回百分数 例如 29%
    }

    // 获取当前站点合计费率(小数形式)
    function getPlatformRateDecimal(siteCode) {
        return computeTotalFeePercent(siteCode) / 100;
    }

    // 获取关税税率(小数)
    function getTariffRateDecimal(siteCode) {
        let rate = tariffRates[siteCode] || 0;
        return rate / 100;
    }

    // 计算国际物流成本 (当地货币)
    function calcShippingCost(siteCode, weightGram) {
        let cfg = shippingRates[siteCode];
        if (!cfg) return 0;
        let { firstGram, firstPrice, additionalPer10g } = cfg;
        if (weightGram <= firstGram) return firstPrice;
        let extraGram = weightGram - firstGram;
        let steps = Math.ceil(extraGram / 10);
        return firstPrice + steps * additionalPer10g;
    }

    // 获取汇率 (1人民币 → 当地货币)
    function getExchangeRate(siteCode) {
        return exchangeRates[siteCode] || 1;
    }

    // 核心利润计算，返回所有明细对象 (当地货币)
    function calculateProfit(siteCode, originalPriceLocal, discountVal, weightGram, freightAgentCNY, couponLocal, goodsCostCNY) {
        let exchange = getExchangeRate(siteCode);
        let discountFactor = discountVal / 10;
        let discountedPrice = originalPriceLocal * discountFactor;   // 折后价(本地)

        // 1. 平台费
        let platformRate = getPlatformRateDecimal(siteCode);
        let platformFee = discountedPrice * platformRate;

        // 2. 关税 (泰国有效)
        let tariffRate = getTariffRateDecimal(siteCode);
        let customsDuty = 0;
        if (tariffRate > 0 && siteCode === "THB") {
            // 公式: 折后价/(1+关税税率)*关税税率
            customsDuty = discountedPrice / (1 + tariffRate) * tariffRate;
        }

        // 3. 国际物流
        let shippingLocal = calcShippingCost(siteCode, weightGram);

        // 4. 货代成本 换算当地货币
        let agentLocal = freightAgentCNY * exchange;

        // 5. 优惠券当地货币直接扣减
        let coupon = couponLocal;

        // 6. 货品成本换算当地货币
        let goodsLocal = goodsCostCNY * exchange;

        let profitLocal = discountedPrice - platformFee - customsDuty - shippingLocal - agentLocal - coupon - goodsLocal;
        let profitCNY = profitLocal / exchange;

        return {
            discountedPrice,
            platformFee,
            customsDuty,
            shippingLocal,
            agentLocal,
            coupon,
            goodsLocal,
            profitLocal,
            profitCNY,
            exchangeRate: exchange,
            discountedPriceCNY: discountedPrice / exchange
        };
    }

    // 刷新界面所有显示: 从表单取值，计算并渲染结果 + 更新费率表显示等
    function refreshAll() {
        // 读取表单
        let siteSelect = document.getElementById("siteSelect");
        currentSite = siteSelect.value;
        let originalPrice = parseFloat(document.getElementById("originalPrice").value) || 0;
        let discount = parseFloat(document.getElementById("discount").value) || 10;
        let weight = parseFloat(document.getElementById("weight").value) || 0;
        let freightAgent = parseFloat(document.getElementById("freightAgent").value) || 0;
        let coupon = parseFloat(document.getElementById("coupon").value) || 0;
        let goodsCost = parseFloat(document.getElementById("goodsCost").value) || 0;

        // 折扣范围限制1-10
        if (discount < 1) discount = 1;
        if (discount > 10) discount = 10;
        document.getElementById("discount").value = discount;

        // 计算利润
        let result = calculateProfit(currentSite, originalPrice, discount, weight, freightAgent, coupon, goodsCost);
        
        // 更新界面显示
        document.getElementById("discountedLocal").innerHTML = formatCurrency(result.discountedPrice, currentSite);
        document.getElementById("discountedCny").innerHTML = `¥ ${result.discountedPriceCNY.toFixed(2)}`;
        document.getElementById("platformFee").innerHTML = formatCurrency(result.platformFee, currentSite);
        document.getElementById("customsDuty").innerHTML = formatCurrency(result.customsDuty, currentSite);
        document.getElementById("shippingCost").innerHTML = formatCurrency(result.shippingLocal, currentSite);
        document.getElementById("agentCostLocal").innerHTML = formatCurrency(result.agentLocal, currentSite);
        document.getElementById("couponShow").innerHTML = formatCurrency(result.coupon, currentSite);
        document.getElementById("goodsCostLocal").innerHTML = formatCurrency(result.goodsLocal, currentSite);
        document.getElementById("profitLocal").innerHTML = formatCurrency(result.profitLocal, currentSite);
        document.getElementById("profitCny").innerHTML = `¥ ${result.profitCNY.toFixed(2)}`;
        
        // 更新货币单位提示
        let siteObj = SITES.find(s => s.code === currentSite);
        if (siteObj) {
            document.getElementById("currencyHint").innerHTML = `(${siteObj.currency} 当地货币)`;
            document.getElementById("couponHint").innerHTML = `(${siteObj.currency})`;
        }
    }

    function formatCurrency(value, siteCode) {
        let site = SITES.find(s => s.code === siteCode);
        let symbol = site ? site.currency : "";
        if (isNaN(value)) value = 0;
        let formatted = value.toFixed(2);
        if (siteCode === "VND") formatted = Math.round(value).toLocaleString('en-US');
        else formatted = value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        return `${symbol} ${formatted}`;
    }

    // 构建费率表格(可编辑)
    function buildFeeTable() {
        let tbody = document.getElementById("feeTbody");
        tbody.innerHTML = "";
        for (let site of SITES) {
            let fees = subFeeRates[site.code] || [0,0,0,0,0,0];
            let totalPercent = computeTotalFeePercent(site.code);
            let tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="font-weight:600;">${site.name}</td>
                <td><input type="number" step="0.01" class="small-input fee-input" data-site="${site.code}" data-index="0" value="${fees[0]}"></td>
                <td><input type="number" step="0.01" class="small-input fee-input" data-site="${site.code}" data-index="1" value="${fees[1]}"></td>
                <td><input type="number" step="0.01" class="small-input fee-input" data-site="${site.code}" data-index="2" value="${fees[2]}"></td>
                <td><input type="number" step="0.01" class="small-input fee-input" data-site="${site.code}" data-index="3" value="${fees[3]}"></td>
                <td><input type="number" step="0.01" class="small-input fee-input" data-site="${site.code}" data-index="4" value="${fees[4]}"></td>
                <td><input type="number" step="0.01" class="small-input fee-input" data-site="${site.code}" data-index="5" value="${fees[5]}"></td>
                <td style="background:#f1f5f9; font-weight:bold;">${totalPercent.toFixed(2)}%</td>
            `;
            tbody.appendChild(tr);
        }
        // 绑定事件
        document.querySelectorAll('.fee-input').forEach(inp => {
            inp.addEventListener('change', function(e) {
                let siteCode = this.dataset.site;
                let idx = parseInt(this.dataset.index);
                let val = parseFloat(this.value) || 0;
                if (!subFeeRates[siteCode]) subFeeRates[siteCode] = [0,0,0,0,0,0];
                subFeeRates[siteCode][idx] = val;
                buildFeeTable();    // 刷新表格使合计更新
                refreshAll();       // 重新计算利润
            });
        });
    }

    function buildShippingTable() {
        let tbody = document.getElementById("shippingTbody");
        tbody.innerHTML = "";
        for (let site of SITES) {
            let cfg = shippingRates[site.code] || { firstGram: 10, firstPrice: 0, additionalPer10g: 0 };
            let tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${site.name}</td>
                <td><input type="number" step="1" class="small-input shipping-gram" data-site="${site.code}" data-field="firstGram" value="${cfg.firstGram}"></td>
                <td><input type="number" step="0.01" class="small-input shipping-first" data-site="${site.code}" data-field="firstPrice" value="${cfg.firstPrice}"></td>
                <td><input type="number" step="0.01" class="small-input shipping-add" data-site="${site.code}" data-field="additionalPer10g" value="${cfg.additionalPer10g}"></td>
            `;
            tbody.appendChild(tr);
        }
        document.querySelectorAll('.shipping-gram, .shipping-first, .shipping-add').forEach(inp => {
            inp.addEventListener('change', function() {
                let siteCode = this.dataset.site;
                let field = this.dataset.field;
                let val = parseFloat(this.value) || 0;
                if (!shippingRates[siteCode]) shippingRates[siteCode] = { firstGram: 10, firstPrice: 0, additionalPer10g: 0 };
                shippingRates[siteCode][field] = val;
                refreshAll();
            });
        });
    }

    function buildExchangeTable() {
        let tbody = document.getElementById("exchangeTbody");
        tbody.innerHTML = "";
        for (let site of SITES) {
            let rate = exchangeRates[site.code];
            let tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${site.name}</td>
                <td><input type="number" step="0.001" class="small-input exchange-input" data-site="${site.code}" value="${rate}"></td>
            `;
            tbody.appendChild(tr);
        }
        document.querySelectorAll('.exchange-input').forEach(inp => {
            inp.addEventListener('change', function() {
                let siteCode = this.dataset.site;
                let val = parseFloat(this.value);
                if (!isNaN(val) && val > 0) exchangeRates[siteCode] = val;
                refreshAll();
            });
        });
    }

    function buildCustomsTable() {
        let tbody = document.getElementById("customsTbody");
        tbody.innerHTML = "";
        for (let site of SITES) {
            let val = tariffRates[site.code] || 0;
            let tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${site.name}</td>
                <td><input type="number" step="0.1" class="small-input customs-input" data-site="${site.code}" value="${val}"></td>
            `;
            tbody.appendChild(tr);
        }
        document.querySelectorAll('.customs-input').forEach(inp => {
            inp.addEventListener('change', function() {
                let siteCode = this.dataset.site;
                let val = parseFloat(this.value) || 0;
                tariffRates[siteCode] = val;
                refreshAll();
            });
        });
    }

    function resetToDefaults() {
        subFeeRates = JSON.parse(JSON.stringify(defaultSubFees));
        shippingRates = JSON.parse(JSON.stringify(defaultShipping));
        exchangeRates = {
            VND: 3802, THB: 4.7, MYR: 1/1.69, PHP: 8.65, SGD: 1/5.45
        };
        tariffRates = { VND: 0, THB: 30, MYR: 0, PHP: 0, SGD: 0 };
        // 重建所有配置表
        buildFeeTable();
        buildShippingTable();
        buildExchangeTable();
        buildCustomsTable();
        refreshAll();
    }

    // 监听基础输入
    function bindBasicInputs() {
        const inputs = ['originalPrice', 'discount', 'weight', 'freightAgent', 'coupon', 'goodsCost', 'siteSelect'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => refreshAll());
            if (el && el.tagName === 'SELECT') el.addEventListener('change', () => {
                // 切换站点时更新货币相关提示
                refreshAll();
            });
        });
    }

    // 初始化所有
    function init() {
        buildFeeTable();
        buildShippingTable();
        buildExchangeTable();
        buildCustomsTable();
        bindBasicInputs();
        refreshAll();
        document.getElementById("resetDefaultsBtn").addEventListener("click", resetToDefaults);
    }

    init();
