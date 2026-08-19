const modules = [];

export const register = (m) => {
    if (!m?.id) throw new Error('Wealth module requires an id');
    if (modules.some(x => x.id === m.id)) return;
    modules.push(m);
};

export const all = () => modules.slice();

export const snapshotAll = (state, asOf) =>
    modules.map(m => m.snapshot(state, asOf));
