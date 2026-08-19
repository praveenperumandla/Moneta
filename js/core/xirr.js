export const calculateXIRR = (cashflows) => {
    if (!cashflows || cashflows.length < 2) return 0;
    const dates = cashflows.map(cf => new Date(cf.date));
    const amounts = cashflows.map(cf => cf.amount);
    const minDate = dates.reduce((a, b) => a < b ? a : b);
    const xnpv = (r) => amounts.reduce((s, a, i) => {
        const t = (dates[i] - minDate) / (365.25 * 24 * 3600 * 1000);
        return s + a / Math.pow(1 + r, t);
    }, 0);
    const xnpv_prime = (r) => amounts.reduce((s, a, i) => {
        const t = (dates[i] - minDate) / (365.25 * 24 * 3600 * 1000);
        return s - t * a / Math.pow(1 + r, t + 1);
    }, 0);
    let rate = 0.1;
    for (let i = 0; i < 100; i++) {
        const val = xnpv(rate), deriv = xnpv_prime(rate);
        if (Math.abs(val) < 0.000001) return rate;
        if (deriv === 0) break;
        const next = rate - val / deriv;
        if (Math.abs(next - rate) < 0.000001) return next;
        rate = next;
        if (rate <= -1) rate = -0.999999;
    }
    return rate;
};
