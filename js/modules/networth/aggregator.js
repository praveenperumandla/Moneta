export const totalNetWorth = (snapshots) => {
    const assets = snapshots.reduce((s, x) => s + (x.assets || 0), 0);
    const liabilities = snapshots.reduce((s, x) => s + (x.liabilities || 0), 0);
    return { assets, liabilities, net: assets - liabilities };
};
