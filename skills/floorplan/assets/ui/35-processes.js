// "How it works": a button that opens the app's main processes (graph.processes) as a board on the map's
// own canvas. The board itself is drawn by the viewer (container q:how); this only adds the way in.
(() => {
  const SC = window.Floorplan;
  if (!SC || !SC.graph.processes?.length) return;
  SC.addHeaderButton({ id: 'btn-processes', label: 'How it works', icon: 'processes', title: "The app's main processes, step by step", onClick: () => { SC.closeMenus(); SC.showHow(); } });
})();
