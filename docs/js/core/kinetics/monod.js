(() => {
  const kinetics = window.BioreactKinetics || (window.BioreactKinetics = {});

  kinetics.monodMu = function monodMu(params, state) {
    const muMax = Math.max(Number(params.muMax) || 0, 0);
    const ks = Math.max(Number(params.ks) || 0, 0);
    const s = Math.max(Number(state.s) || 0, 0);

    const denom = ks + s;
    return denom > 0 ? (muMax * s) / denom : 0;
  };
})();
