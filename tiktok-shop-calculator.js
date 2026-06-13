
    // ---------- 初始化默认数据 (基于excel原始参考) ----------
    // 站点列表
    const SITES = [
        { code: "MYR", name: "马来", currency: "RM", exchangeRate: 1/1.69, defaultTariff: 0 },
        { code: "PHP", name: "菲律宾", currency: "₱", exchangeRate: 8.65, defaultTariff: 0 },
        { code: "SGD", name: "新加坡", currency: "S$", exchangeRate: 1/5.45, defaultTariff: 0 },
        { code: "THB", name: "泰国", currency: "฿", exchangeRate: 4.7, defaultTariff: 0 },   // 0%
        { code: "VND", name: "越南", currency: "₫", exchangeRate: 3802, defaultTariff: 0 }
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

    // 历史汇率数据 (用于计算涨跌幅)
    let historicalRates = {};
    
    // 当前选中的站点code
    let currentSite = "VND";

    // 各站点单独售价 (人民币)
    let sitePrices = {
        VND: 90,
        THB: 90,
        MYR: 90,
        PHP: 90,
        SGD: 90
    };

    // 各站点单独折扣范围
    let siteDiscounts = {
        VND: 5,
        THB: 5,
        MYR: 5,
        PHP: 5,
        SGD: 5
    };

    // 各站点单独优惠券 (人民币)
    let siteCoupons = {
        VND: 0,
        THB: 0,
        MYR: 0,
        PHP: 0,
        SGD: 0
    };

    // 各站点单独达人佣金率 (%)
    let siteInfluencerCommissions = {
        VND: 0,
        THB: 0,
        MYR: 0,
        PHP: 0,
        SGD: 0
    };

    // 标记哪些站点被手动修改过
    let siteModified = {
        VND: { price: false, discount: false, coupon: false, influencer: false },
        THB: { price: false, discount: false, coupon: false, influencer: false },
        MYR: { price: false, discount: false, coupon: false, influencer: false },
        PHP: { price: false, discount: false, coupon: false, influencer: false },
        SGD: { price: false, discount: false, coupon: false, influencer: false }
    };

    // 动态费率存储 (百分比数值数组)
    let subFeeRates = JSON.parse(JSON.stringify(defaultSubFees));
    // 物流存储
    let shippingRates = JSON.parse(JSON.stringify(defaultShipping));

    // ---------- 辅助函数 ----------
    
    // 检查是否需要更新汇率（每天更新一次）
    function shouldUpdateRates() {
        const lastUpdate = localStorage.getItem('exchangeRatesLastUpdate');
        const today = new Date().toDateString();
        if (!lastUpdate || lastUpdate !== today) {
            return true;
        }
        return false;
    }

    // 获取实时汇率
    async function fetchExchangeRates() {
        try {
            // 使用Frankfurter API获取汇率（CNY为基准）
            const response = await fetch('https://api.frankfurter.app/latest?from=CNY&to=VND,THB,MYR,PHP,SGD');
            const data = await response.json();
            
            if (data.rates) {
                return data.rates;
            }
        } catch (error) {
            console.error('Failed to fetch exchange rates:', error);
        }
        return null;
    }

    // 获取历史汇率（用于计算涨跌幅）
    async function fetchHistoricalRates(daysAgo) {
        try {
            const date = new Date();
            date.setDate(date.getDate() - daysAgo);
            const dateStr = date.toISOString().split('T')[0];
            const response = await fetch(`https://api.frankfurter.app/${dateStr}?from=CNY&to=VND,THB,MYR,PHP,SGD`);
            const data = await response.json();
            if (data.rates) {
                return data.rates;
            }
        } catch (error) {
            console.error('Failed to fetch historical rates:', error);
        }
        return null;
    }

    // 计算涨跌幅
    function calculateChangePercent(current, previous) {
        if (!previous || previous === 0) return 0;
        return ((current - previous) / previous * 100).toFixed(2);
    }

    // 更新汇率并保存到本地存储
    async function updateExchangeRates() {
        if (!shouldUpdateRates()) {
            // 使用缓存的汇率
            const cachedRates = localStorage.getItem('exchangeRates');
            const cachedHistory = localStorage.getItem('exchangeRatesHistory');
            if (cachedRates) {
                exchangeRates = JSON.parse(cachedRates);
            }
            if (cachedHistory) {
                historicalRates = JSON.parse(cachedHistory);
            }
            return;
        }

        // 获取实时汇率
        const currentRates = await fetchExchangeRates();
        if (currentRates) {
            // 更新汇率（转换格式：1CNY = X 当地货币）
            exchangeRates = {
                VND: currentRates.VND || 3802,
                THB: currentRates.THB || 4.7,
                MYR: currentRates.MYR || 1/1.69,
                PHP: currentRates.PHP || 8.65,
                SGD: currentRates.SGD || 1/5.45
            };

            // 获取历史汇率（1天前和7天前）
            const history1Day = await fetchHistoricalRates(1);
            const history7Day = await fetchHistoricalRates(7);
            
            historicalRates = {
                '1day': history1Day || {},
                '7day': history7Day || {}
            };

            // 保存到本地存储
            localStorage.setItem('exchangeRates', JSON.stringify(exchangeRates));
            localStorage.setItem('exchangeRatesHistory', JSON.stringify(historicalRates));
            localStorage.setItem('exchangeRatesLastUpdate', new Date().toDateString());
        }
    }

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

    // 获取合计费率(百分比)
    function getTotalFeeRate(siteCode) {
        return computeTotalFeePercent(siteCode) / 100;
    }

    // 获取关税税率(百分比)
    function getTariffRate(siteCode) {
        let rate = tariffRates[siteCode] || 0;
        return rate / 100;
    }

    // 获取首重克数
    function getFirstWeight(siteCode) {
        let cfg = shippingRates[siteCode];
        if (!cfg) return 0;
        return cfg.firstGram || 0;
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
    function calculateProfit(siteCode, originalPriceCNY, discountVal, weightGram, freightAgentCNY, couponCNY, goodsCostCNY, influencerCommissionRate) {
        let exchange = getExchangeRate(siteCode);
        let discountFactor = discountVal / 10;
        // 人民币售价先换算成当地货币，再计算折后价
        let originalPriceLocal = originalPriceCNY * exchange;
        let discountedPrice = originalPriceLocal * discountFactor;   // 折后价(本地)
        let discountedPriceCNY = originalPriceCNY * discountFactor; // 折后价(人民币)

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

        // 5. 优惠券处理 (人民币金额)
        let couponCNYValue = couponCNY;
        // 换算成当地货币
        let coupon = couponCNYValue * exchange;

        // 6. 货品成本换算当地货币
        let goodsLocal = goodsCostCNY * exchange;

        // 7. 达人佣金 (折后价 × 达人佣金率)
        let influencerCommission = discountedPrice * (influencerCommissionRate / 100);

        let profitLocal = discountedPrice - platformFee - customsDuty - shippingLocal - agentLocal - coupon - goodsLocal - influencerCommission;
        let profitCNY = profitLocal / exchange;

        return {
            discountedPrice,
            platformFee,
            customsDuty,
            shippingLocal,
            agentLocal,
            coupon,
            goodsLocal,
            influencerCommission,
            profitLocal,
            profitCNY,
            exchangeRate: exchange,
            discountedPriceCNY: discountedPrice / exchange
        };
    }

    // 刷新界面所有显示: 从表单取值，计算并渲染结果 + 更新费率表显示等
    function refreshAll() {
        // 读取表单
        let originalPrice = parseFloat(document.getElementById("originalPrice").value) || 0;
        let discount = parseFloat(document.getElementById("discount").value) || 10;
        let weight = parseFloat(document.getElementById("weight").value) || 0;
        let freightAgent = parseFloat(document.getElementById("freightAgent").value) || 0;
        let coupon = parseFloat(document.getElementById("coupon").value) || 0;
        let goodsCost = parseFloat(document.getElementById("goodsCost").value) || 0;
        let influencerCommission = parseFloat(document.getElementById("influencerCommission").value) || 0;

        // 折扣范围限制1-10
        if (discount < 1) discount = 1;
        if (discount > 10) discount = 10;
        document.getElementById("discount").value = discount;

        // 达人佣金率范围限制0-50
        if (influencerCommission < 0) influencerCommission = 0;
        if (influencerCommission > 50) influencerCommission = 50;
        document.getElementById("influencerCommission").value = influencerCommission;

        // 生成表格，显示所有站点的数据
        buildProfitTable(originalPrice, discount, weight, freightAgent, coupon, goodsCost, influencerCommission);
        
        // 更新表格中的输入框值（如果站点没有单独设置过，则显示基础值）
        updateTableInputs(originalPrice, discount, coupon, influencerCommission);
    }

    // 更新表格中的输入框值
    function updateTableInputs(originalPrice, discount, coupon, influencerCommission) {
        SITES.forEach(site => {
            // 如果站点没有单独修改过，则使用基础值更新输入框
            if (!siteModified[site.code].price) {
                const priceInput = document.querySelector(`.site-price-input[data-site="${site.code}"]`);
                if (priceInput) {
                    priceInput.value = originalPrice;
                    sitePrices[site.code] = originalPrice;
                }
            }
            if (!siteModified[site.code].discount) {
                const discountInput = document.querySelector(`.site-discount-input[data-site="${site.code}"]`);
                if (discountInput) {
                    discountInput.value = discount;
                    siteDiscounts[site.code] = discount;
                }
            }
            if (!siteModified[site.code].coupon) {
                const couponInput = document.querySelector(`.site-coupon-input[data-site="${site.code}"]`);
                if (couponInput) {
                    couponInput.value = coupon;
                    siteCoupons[site.code] = coupon;
                }
            }
            if (!siteModified[site.code].influencer) {
                const influencerInput = document.querySelector(`.site-influencer-input[data-site="${site.code}"]`);
                if (influencerInput) {
                    influencerInput.value = influencerCommission;
                    siteInfluencerCommissions[site.code] = influencerCommission;
                }
            }
        });
    }

    // 构建利润表格
    function buildProfitTable(originalPrice, discount, weight, freightAgent, coupon, goodsCost, influencerCommission) {
        const tbody = document.getElementById("profitTableBody");
        tbody.innerHTML = "";

        SITES.forEach(site => {
            // 使用各站点单独的售价、折扣、优惠券和达人佣金率
            let sitePrice = siteModified[site.code].price ? sitePrices[site.code] : originalPrice;
            let siteDiscount = siteModified[site.code].discount ? siteDiscounts[site.code] : discount;
            let siteCoupon = siteModified[site.code].coupon ? siteCoupons[site.code] : coupon;
            let siteInfluencerCommission = siteModified[site.code].influencer ? siteInfluencerCommissions[site.code] : influencerCommission;
            let result = calculateProfit(site.code, sitePrice, siteDiscount, weight, freightAgent, siteCoupon, goodsCost, siteInfluencerCommission);
            
            let tr = document.createElement("tr");
            // 计算当地售价（人民币售价 × 汇率）
            let localPrice = sitePrice * result.exchangeRate;
            tr.innerHTML = `
                <td style="font-weight: 600;">${site.name}</td>
                <td><input type="number" class="site-price-input" data-site="${site.code}" value="${sitePrice}" step="1" style="width: 80px; padding: 4px; text-align: center;" title="基础售价"></td>
                <td title="售价¥${sitePrice} × ${result.exchangeRate.toFixed(4)}汇率 = ${formatCurrency(localPrice, site.code)}">${formatCurrency(localPrice, site.code)}</td>
                <td><input type="number" class="site-discount-input" data-site="${site.code}" value="${siteDiscount}" min="1" max="10" step="1" style="width: 60px; padding: 4px; text-align: center;" title="1=1折,10=不打折"></td>
                <td><input type="number" class="site-coupon-input" data-site="${site.code}" value="${siteCoupon}" step="0.5" style="width: 70px; padding: 4px; text-align: center;" title="优惠券金额(人民币)"></td>
                <td><input type="number" class="site-influencer-input" data-site="${site.code}" value="${siteInfluencerCommission}" min="0" max="50" step="0.5" style="width: 70px; padding: 4px; text-align: center;" title="达人佣金率(%)"></td>
                <td title="售价¥${sitePrice} × (${siteDiscount}折扣/10) × ${result.exchangeRate.toFixed(4)}汇率 = ${formatCurrency(result.discountedPrice, site.code)}">${formatCurrency(result.discountedPrice, site.code)}</td>
                <td title="折后价${formatCurrency(result.discountedPrice, site.code)} ÷ ${result.exchangeRate.toFixed(4)}汇率 = ¥${result.discountedPriceCNY.toFixed(2)}">¥ ${result.discountedPriceCNY.toFixed(2)}</td>
                <td title="折后价${formatCurrency(result.discountedPrice, site.code)} × 合计费率${(getTotalFeeRate(site.code)*100).toFixed(2)}% = ${formatCurrency(result.platformFee, site.code)}"><div style="font-size: 0.85rem;">${formatCurrency(result.platformFee, site.code)}</div><div style="font-size: 0.7rem; color: #86909c;">¥ ${(result.platformFee / result.exchangeRate).toFixed(2)}</div></td>
                <td title="折后价${formatCurrency(result.discountedPrice, site.code)} × 关税${(getTariffRate(site.code)*100).toFixed(2)}% = ${formatCurrency(result.customsDuty, site.code)}"><div style="font-size: 0.85rem;">${formatCurrency(result.customsDuty, site.code)}</div><div style="font-size: 0.7rem; color: #86909c;">¥ ${(result.customsDuty / result.exchangeRate).toFixed(2)}</div></td>
                <td title="首重费用 + (重量${weight}g - 首重${getFirstWeight(site.code)}g) × 续重费率 = ${formatCurrency(result.shippingLocal, site.code)}"><div style="font-size: 0.85rem;">${formatCurrency(result.shippingLocal, site.code)}</div><div style="font-size: 0.7rem; color: #86909c;">¥ ${(result.shippingLocal / result.exchangeRate).toFixed(2)}</div></td>
                <td title="货代成本¥${freightAgent} × ${result.exchangeRate.toFixed(4)}汇率 = ${formatCurrency(result.agentLocal, site.code)}"><div style="font-size: 0.85rem;">${formatCurrency(result.agentLocal, site.code)}</div><div style="font-size: 0.7rem; color: #86909c;">¥ ${(result.agentLocal / result.exchangeRate).toFixed(2)}</div></td>
                <td title="优惠券¥${siteCoupon} × ${result.exchangeRate.toFixed(4)}汇率 = ${formatCurrency(result.coupon, site.code)}"><div style="font-size: 0.85rem;">${formatCurrency(result.coupon, site.code)}</div><div style="font-size: 0.7rem; color: #86909c;">¥ ${(result.coupon / result.exchangeRate).toFixed(2)}</div></td>
                <td title="货品成本¥${goodsCost} × ${result.exchangeRate.toFixed(4)}汇率 = ${formatCurrency(result.goodsLocal, site.code)}"><div style="font-size: 0.85rem;">${formatCurrency(result.goodsLocal, site.code)}</div><div style="font-size: 0.7rem; color: #86909c;">¥ ${(result.goodsLocal / result.exchangeRate).toFixed(2)}</div></td>
                <td title="折后价${formatCurrency(result.discountedPrice, site.code)} × ${siteInfluencerCommission}%达人佣金 = ${formatCurrency(result.influencerCommission, site.code)}"><div style="font-size: 0.85rem;">${formatCurrency(result.influencerCommission, site.code)}</div><div style="font-size: 0.7rem; color: #86909c;">¥ ${(result.influencerCommission / result.exchangeRate).toFixed(2)}</div></td>
                <td style="font-weight: bold; color: ${result.profitLocal >= 0 ? '#00b42a' : '#fe2c55'};" title="折后价${formatCurrency(result.discountedPrice, site.code)} - 平台费${formatCurrency(result.platformFee, site.code)} - 关税${formatCurrency(result.customsDuty, site.code)} - 物流${formatCurrency(result.shippingLocal, site.code)} - 货代${formatCurrency(result.agentLocal, site.code)} - 优惠券${formatCurrency(result.coupon, site.code)} - 货品${formatCurrency(result.goodsLocal, site.code)} - 达人佣金${formatCurrency(result.influencerCommission, site.code)} = ${formatCurrency(result.profitLocal, site.code)}">${formatCurrency(result.profitLocal, site.code)}</td>
                <td style="font-weight: bold; color: ${result.profitCNY >= 0 ? '#00b42a' : '#fe2c55'};" title="净利润${formatCurrency(result.profitLocal, site.code)} ÷ ${result.exchangeRate.toFixed(4)}汇率 = ¥${result.profitCNY.toFixed(2)}">¥ ${result.profitCNY.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });

        // 绑定输入事件
        bindSiteInputs();
    }

    // 绑定站点售价和折扣输入事件
    function bindSiteInputs() {
        // 绑定售价输入
        const priceInputs = document.querySelectorAll('.site-price-input');
        priceInputs.forEach(input => {
            input.addEventListener('change', function() {
                const siteCode = this.dataset.site;
                const value = parseFloat(this.value) || 0;
                sitePrices[siteCode] = value;
                siteModified[siteCode].price = true;  // 标记为已修改
                refreshAll();
            });
        });
        
        // 绑定折扣输入
        const discountInputs = document.querySelectorAll('.site-discount-input');
        discountInputs.forEach(input => {
            input.addEventListener('change', function() {
                const siteCode = this.dataset.site;
                let value = parseFloat(this.value) || 1;
                // 限制范围1-10
                if (value < 1) value = 1;
                if (value > 10) value = 10;
                this.value = value;
                siteDiscounts[siteCode] = value;
                siteModified[siteCode].discount = true;  // 标记为已修改
                refreshAll();
            });
        });
        
        // 绑定优惠券输入
        const couponInputs = document.querySelectorAll('.site-coupon-input');
        couponInputs.forEach(input => {
            input.addEventListener('change', function() {
                const siteCode = this.dataset.site;
                let value = parseFloat(this.value) || 0;
                // 限制非负
                if (value < 0) value = 0;
                this.value = value;
                siteCoupons[siteCode] = value;
                siteModified[siteCode].coupon = true;  // 标记为已修改
                refreshAll();
            });
        });
        
        // 绑定达人佣金率输入
        const influencerInputs = document.querySelectorAll('.site-influencer-input');
        influencerInputs.forEach(input => {
            input.addEventListener('change', function() {
                const siteCode = this.dataset.site;
                let value = parseFloat(this.value) || 0;
                // 限制范围0-50
                if (value < 0) value = 0;
                if (value > 50) value = 50;
                this.value = value;
                siteInfluencerCommissions[siteCode] = value;
                siteModified[siteCode].influencer = true;  // 标记为已修改
                refreshAll();
            });
        });
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
            // 计算首重费用换算成人民币
            let firstPriceCNY = cfg.firstPrice / exchangeRates[site.code];
            let tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${site.name}</td>
                <td><input type="number" step="1" class="small-input shipping-gram" data-site="${site.code}" data-field="firstGram" value="${cfg.firstGram}"></td>
                <td><input type="number" step="0.01" class="small-input shipping-first" data-site="${site.code}" data-field="firstPrice" value="${cfg.firstPrice}"></td>
                <td style="background:#f1f5f9; font-weight:500;">¥ ${firstPriceCNY.toFixed(2)}</td>
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
                buildShippingTable();  // 刷新表格以更新人民币金额
                refreshAll();
            });
        });
    }

    function buildExchangeTable() {
        let tbody = document.getElementById("exchangeTbody");
        tbody.innerHTML = "";
        for (let site of SITES) {
            let rate = exchangeRates[site.code];
            // 计算涨跌幅
            let change1Day = 0;
            let change7Day = 0;
            if (historicalRates['1day'] && historicalRates['1day'][site.code]) {
                change1Day = calculateChangePercent(rate, historicalRates['1day'][site.code]);
            }
            if (historicalRates['7day'] && historicalRates['7day'][site.code]) {
                change7Day = calculateChangePercent(rate, historicalRates['7day'][site.code]);
            }
            
            // 涨跌幅样式
            let change1DayClass = change1Day > 0 ? 'rate-up' : (change1Day < 0 ? 'rate-down' : 'rate-neutral');
            let change7DayClass = change7Day > 0 ? 'rate-up' : (change7Day < 0 ? 'rate-down' : 'rate-neutral');
            
            let tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${site.name}</td>
                <td><input type="number" step="0.001" class="small-input exchange-input" data-site="${site.code}" value="${rate}"></td>
                <td class="${change1DayClass}">${change1Day > 0 ? '↑' : change1Day < 0 ? '↓' : '—'} ${Math.abs(change1Day)}%</td>
                <td class="${change7DayClass}">${change7Day > 0 ? '↑' : change7Day < 0 ? '↓' : '—'} ${Math.abs(change7Day)}%</td>
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
        const inputs = ['originalPrice', 'discount', 'weight', 'freightAgent', 'coupon', 'goodsCost', 'influencerCommission'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => refreshAll());
        });
    }

    // 初始化所有
    async function init() {
        // 先更新汇率（每天一次）
        await updateExchangeRates();
        
        // 更新汇率更新时间显示
        const lastUpdate = localStorage.getItem('exchangeRatesLastUpdate');
        const rateUpdateEl = document.getElementById('rateUpdateTime');
        if (rateUpdateEl && lastUpdate) {
            rateUpdateEl.textContent = `汇率更新: ${lastUpdate}`;
        }
        
        buildFeeTable();
        buildShippingTable();
        buildExchangeTable();
        buildCustomsTable();
        bindBasicInputs();
        refreshAll();
        document.getElementById("resetDefaultsBtn").addEventListener("click", resetToDefaults);
        
        // 添加手动刷新汇率按钮事件
        const refreshBtn = document.getElementById('refreshRatesBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async function() {
                // 清除缓存，强制更新
                localStorage.removeItem('exchangeRatesLastUpdate');
                await updateExchangeRates();
                buildExchangeTable();
                refreshAll();
                
                // 显示更新完成弹窗
                showToast('✅ 汇率更新完成！');
            });
        }
        
        // 添加导出表格按钮事件
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportTableToClipboard);
        }
        
        // 添加全部换品按钮事件
        const resetAllSitesBtn = document.getElementById('resetAllSitesBtn');
        if (resetAllSitesBtn) {
            resetAllSitesBtn.addEventListener('click', resetAllSitesToDefault);
        }
    }

    // 全部换品：将所有站点重置为默认基础数据
    function resetAllSitesToDefault() {
        // 重置所有站点的修改标志
        SITES.forEach(site => {
            siteModified[site.code] = {
                price: false,
                discount: false,
                coupon: false,
                influencer: false
            };
        });
        
        // 重新读取基础数据
        const originalPrice = parseFloat(document.getElementById("originalPrice").value) || 0;
        const discount = parseFloat(document.getElementById("discount").value) || 10;
        const coupon = parseFloat(document.getElementById("coupon").value) || 0;
        const influencerCommission = parseFloat(document.getElementById("influencerCommission").value) || 0;
        
        // 重新构建表格
        const weight = parseFloat(document.getElementById("weight").value) || 0;
        const freightAgent = parseFloat(document.getElementById("freightAgent").value) || 0;
        const goodsCost = parseFloat(document.getElementById("goodsCost").value) || 0;
        
        buildProfitTable(originalPrice, discount, weight, freightAgent, coupon, goodsCost, influencerCommission);
        
        // 显示提示
        showToast('✅ 已全部换品，所有站点已重置为默认数据！');
    }

    // 导出表格到剪贴板
    function exportTableToClipboard() {
        const table = document.getElementById('profitTable');
        if (!table) {
            showToast('❌ 未找到表格数据');
            return;
        }

        // 构建表格文本（制表符分隔，适合Excel）
        let tableText = '';
        
        // 获取表头
        const headers = table.querySelectorAll('thead th');
        const headerTexts = [];
        headers.forEach(header => {
            headerTexts.push(header.textContent.trim());
        });
        tableText += headerTexts.join('\t') + '\n';
        
        // 获取数据行
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            const cellTexts = [];
            cells.forEach(cell => {
                // 检查是否有输入框
                const input = cell.querySelector('input');
                if (input) {
                    cellTexts.push(input.value);
                } else {
                    // 处理多行文本（如人民币价格）
                    const divs = cell.querySelectorAll('div');
                    if (divs.length > 0) {
                        const texts = [];
                        divs.forEach(div => texts.push(div.textContent.trim()));
                        cellTexts.push(texts.join(' '));
                    } else {
                        cellTexts.push(cell.textContent.trim());
                    }
                }
            });
            tableText += cellTexts.join('\t') + '\n';
        });

        // 复制到剪贴板
        navigator.clipboard.writeText(tableText).then(() => {
            showToast('✅ 表格已复制到剪贴板！可直接粘贴到Excel');
        }).catch(err => {
            console.error('复制失败:', err);
            showToast('❌ 复制失败，请重试');
        });
    }

    // 显示提示弹窗
    function showToast(message) {
        // 创建弹窗元素
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 24px 32px;
            border-radius: 16px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.15);
            font-size: 1rem;
            font-weight: 500;
            color: #2c3e50;
            z-index: 1000;
            text-align: center;
        `;
        toast.textContent = message;
        
        // 添加遮罩
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.3);
            z-index: 999;
        `;
        
        // 添加到页面
        document.body.appendChild(overlay);
        document.body.appendChild(toast);
        
        // 3秒后移除
        setTimeout(() => {
            document.body.removeChild(toast);
            document.body.removeChild(overlay);
        }, 2000);
    }

    init();
