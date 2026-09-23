"use strict";(self.webpackChunkpims_vision_app=self.webpackChunkpims_vision_app||[]).push([[401],{5401(e,t,r){r.r(t),r.d(t,{SqlChartRender:()=>k});var o=r(5959),a=r.n(o),n=r(6089),l=r(2007),i=r(2592),s=r(3463),c=r(7066),u=r(8218),d=r(3905),g=r(9342),m=r(5516),p=r(1797),f=r(5996),v=r(8019),b=r(1973),x=r(5260);function y(e,t,r){return t in e?Object.defineProperty(e,t,{value:r,enumerable:!0,configurable:!0,writable:!0}):e[t]=r,e}const h=["#b4167e","#3274D9","#8F3BB8","#38B2A6","#F2CC0C","#E02F44","#FF780A","#73BF69"];function k({data:e,xAxis:t,yAxes:r,type:n,properties:k}){var S,w,N,z,q;const M=(0,l.useStyles2)(E),[C,L]=(0,o.useState)(0),[P,D]=(0,o.useState)(null),[A,j]=(0,o.useState)(null),[T,F]=(0,o.useState)(null),[O,B]=(0,o.useState)(null),[W,I]=(0,o.useState)(!1),R=Number(("xy"===n?null==k?void 0:k.xyRowsPerPage:void 0)||("bar"===n?null==k?void 0:k.barRowsPerPage:void 0)||("scatter"===n?null==k?void 0:k.scatterRowsPerPage:void 0)||(null==k?void 0:k.paginationSize)||(null==k?void 0:k.tableRowsPerPage)||("table"===n?25:100))||100,_=(0,o.useMemo)(()=>e&&e.length>0?Object.keys(e[0]):[],[e]),K=(0,o.useMemo)(()=>(t,r=!1)=>{if(0!==_.length){if(t){if(_.includes(t))return t;const e=_.find(e=>e.toLowerCase()===t.toLowerCase());if(e)return e}if(r){return _.find(e=>{const t=e.toLowerCase();return"pi_value"===t||"valor"===t||"val"===t||"value"===t||"y"===t||t.includes("medida")})||_.find(t=>{var r;return"number"==typeof(null===(r=e[0])||void 0===r?void 0:r[t])})||(_.length>1?_[1]:_[0])}return _.find(e=>{const t=e.toLowerCase();return"ts"===t||"time"===t||"data"===t||t.includes("date")||t.includes("dth")||t.includes("hora")||t.includes("tempo")})||_[0]}},[_,e]),U=K(t,!1),V=(0,o.useMemo)(()=>{if(0===_.length)return[];if(r&&r.length>0){const e=r.map(e=>K(e,!0)).filter(e=>Boolean(e));if(e.length>0)return Array.from(new Set(e))}const e=K(void 0,!0);return e?[e]:[_[0]]},[r,_,K]),Z=(0,o.useMemo)(()=>{if(!U||0===e.length)return e;const t=e.map(e=>{const t=function(e){for(var t=1;t<arguments.length;t++){var r=null!=arguments[t]?arguments[t]:{},o=Object.keys(r);"function"==typeof Object.getOwnPropertySymbols&&(o=o.concat(Object.getOwnPropertySymbols(r).filter(function(e){return Object.getOwnPropertyDescriptor(r,e).enumerable}))),o.forEach(function(t){y(e,t,r[t])})}return e}({},e);if(V.forEach(r=>{const o=e[r];if(null!=o)if("string"==typeof o){const e=o.replace(",",".").trim(),a=Number(e);isNaN(a)||""===e||(t[r]=a)}else"number"==typeof o&&(t[r]=o)}),"timeseries"===n){const r=e[U];if("string"==typeof r){const e=new Date(r);isNaN(e.getTime())||(t[U]=e.getTime())}}return t});return"timeseries"===n?t.sort((e,t)=>{const r=e[U],o=t[U];return r>o?1:r<o?-1:0}):t},[e,U,V,n]),H=(0,o.useMemo)(()=>{if(0===Z.length||0===V.length)return!1;for(let e=0;e<Math.min(10,Z.length);e++){const t=Z[e][V[0]];if("string"==typeof t&&isNaN(Number(t)))return!0}return!1},[Z,V]),G=Math.ceil(Z.length/R),Q=(0,o.useMemo)(()=>{if("gauge"===n)return Z;if(G<=1)return Z;const e=C*R;return Z.slice(e,e+R)},[Z,R,C,G,n]),X=(0,o.useMemo)(()=>{if(!U)return Q;const e=U;if(O){if("timeseries"===n&&"number"==typeof O.left&&"number"==typeof O.right)return Z.filter(t=>{const r=t[e];return r>=O.left&&r<=O.right});{const t=Z.findIndex(t=>String(t[e])===String(O.left)),r=Z.findIndex(t=>String(t[e])===String(O.right));if(-1!==t&&-1!==r){const[e,o]=t<r?[t,r]:[r,t];return Z.slice(e,o+1)}}}return Q},[Z,Q,O,U,n]),Y=e=>"timeseries"===n&&"number"==typeof e?new Date(e).toLocaleString():e,$=e=>{(null==k?void 0:k.showTrendMarker)&&e&&void 0!==e.activeLabel&&D(e.activeLabel)};if(!U||0===V.length||0===Z.length)return a().createElement("div",{className:M.emptyState},a().createElement("p",null,"Selecione as colunas na configuração para exibir os dados."));if("timeseries"===n){if(!e.some(e=>{const t=e[U];if("number"==typeof t)return!0;if("string"==typeof t){const e=new Date(t);return!isNaN(e.getTime())}return!1}))return a().createElement("div",{className:M.emptyState},a().createElement("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:10,padding:24,textAlign:"center"}},a().createElement("span",{style:{fontSize:32}},"⚠️"),a().createElement("div",{style:{fontSize:15,fontWeight:600,color:"#f87171"}},"Nenhuma coluna de data/tempo disponível (ex: 'TS', 'DATA') para a Série Temporal"),a().createElement("div",{style:{fontSize:13,color:"#94a3b8",maxWidth:420,lineHeight:1.5}},"Para montar a Série Temporal, sua consulta SQL deve retornar ao menos uma coluna com data ou timestamp válido. Você também pode usar a visualização ",a().createElement("strong",null,"Gráfico XY")," ou ",a().createElement("strong",null,"Tabela"),".")))}if("gauge"===n){var J,ee,te,re;const e=null!==(J=null!==(ee=null===(te=Z[Z.length-1])||void 0===te?void 0:te[V[0]])&&void 0!==ee?ee:null===(re=Z[0])||void 0===re?void 0:re[V[0]])&&void 0!==J?J:0,t="number"==typeof e?e:parseFloat(e)||0,r="number"==typeof(null==k?void 0:k.gaugeMin)?k.gaugeMin:0,o="number"==typeof(null==k?void 0:k.gaugeMax)?k.gaugeMax:100,n="number"==typeof(null==k?void 0:k.gaugeDecimals)?k.gaugeDecimals:1,l=(null==k?void 0:k.gaugeUnit)||"%",i=!1!==(null==k?void 0:k.gaugeShowValue),s=!1!==(null==k?void 0:k.gaugeLegend),c=Math.max(r,Math.min(o,t)),u=o>r?(c-r)/(o-r):0,d=80,g=14,m=Math.PI*d,p=m*(1-u),f=(null==k?void 0:k.gaugeColor1)||"#22c55e",v=(null==k?void 0:k.gaugeColor2)||"#eab308",b=(null==k?void 0:k.gaugeColor3)||"#ef4444";let x=f;return u>=.85?x=b:u>=.6&&(x=v),a().createElement("div",{className:M.gaugeContainer},a().createElement("div",{className:M.gaugeSvgWrapper},a().createElement("svg",{width:"220",height:"130",viewBox:"0 0 220 130"},a().createElement("path",{d:"M 20 115 A 80 80 0 0 1 200 115",fill:"none",stroke:"var(--border-color, #334155)",strokeWidth:g,strokeLinecap:"round"}),a().createElement("path",{d:"M 20 115 A 80 80 0 0 1 200 115",fill:"none",stroke:x,strokeWidth:g,strokeDasharray:m,strokeDashoffset:p,strokeLinecap:"round",style:{transition:"stroke-dashoffset 0.5s ease, stroke 0.3s ease"}})),i&&a().createElement("div",{className:M.gaugeValueDisplay},a().createElement("span",{className:M.gaugeNumber},t.toFixed(n)),a().createElement("span",{className:M.gaugeUnit},l))),s&&a().createElement("div",{className:M.gaugeLimits},a().createElement("span",null,r,l),a().createElement("span",{className:M.gaugeFieldLabel},V[0]),a().createElement("span",null,o,l)))}let oe="linear";"Suave"===(null==k?void 0:k.xyLineType)?oe="monotone":"Degrau"===(null==k?void 0:k.xyLineType)?oe="stepAfter":"timeseries"===n&&(oe="linear");const ae=!1!==(null==k?void 0:k.xyShowPoints),ne="bar"===n&&"Horizontal"===(null==k?void 0:k.barOrientation),le=(null==k?void 0:k.barColor)||"#b4167e",ie=!1!==(null==k?void 0:k.xyLegend)&&!1!==(null==k?void 0:k.barLegend)&&!1!==(null==k?void 0:k.scatterLegend)&&!1!==(null==k?void 0:k.timeLegend);return a().createElement("div",{className:M.container},a().createElement("div",{className:M.chartWrapper},a().createElement("div",{style:{position:"absolute",top:0,left:0,right:0,bottom:0}},a().createElement(c.u,{width:"100%",height:"100%"},"bar"===n?a().createElement(x.E,{data:Q,layout:ne?"vertical":"horizontal",margin:{top:20,right:30,left:20,bottom:20},onClick:$},a().createElement(g.d,{strokeDasharray:"3 3",stroke:"var(--sql-border-color, var(--border-subtle, #374151))"}),a().createElement(f.W,{dataKey:ne?void 0:U,type:ne?"number":"category",stroke:"var(--sql-text-color, var(--text-secondary, #94a3b8))",tick:{fontSize:null!==(S=null==k?void 0:k.fontSize)&&void 0!==S?S:12,fill:"var(--sql-text-color, var(--text-secondary, #94a3b8))"}}),a().createElement(v.h,{dataKey:ne?U:void 0,stroke:"var(--sql-text-color, var(--text-secondary, #94a3b8))",type:ne||H?"category":"number",width:ne?110:H?120:60,tick:{fontSize:null!==(w=null==k?void 0:k.fontSize)&&void 0!==w?w:12,fill:"var(--sql-text-color, var(--text-secondary, #94a3b8))"}}),a().createElement(s.m,{contentStyle:{backgroundColor:"var(--sql-row-bg, var(--surface-elevated, #111827))",borderColor:"var(--sql-border-color, var(--border-color, #374151))",color:"var(--sql-text-color, var(--text-primary, #f3f4f6))"}}),ie&&a().createElement(i.s),V.map((e,t)=>a().createElement(p.yP,{key:e,dataKey:e,fill:1===V.length?le:h[t%h.length],isAnimationActive:!1}))):a().createElement(b.b,{data:X,margin:{top:20,right:30,left:20,bottom:20},onClick:$,onMouseDown:e=>{e&&void 0!==e.activeLabel&&(j(e.activeLabel),F(null),I(!0))},onMouseMove:e=>{W&&e&&void 0!==e.activeLabel&&F(e.activeLabel)},onMouseUp:()=>{if(W&&U){if(I(!1),null!==A&&null!==T&&A!==T)if("timeseries"===n&&"number"==typeof A&&"number"==typeof T){const[e,t]=A<T?[A,T]:[T,A];B({left:e,right:t})}else{const e=U,t=Z.findIndex(t=>String(t[e])===String(A)),r=Z.findIndex(t=>String(t[e])===String(T));if(-1!==t&&-1!==r&&t!==r){const[o,a]=t<r?[t,r]:[r,t];B({left:Z[o][e],right:Z[a][e]})}}j(null),F(null)}}},a().createElement(g.d,{strokeDasharray:"3 3",stroke:"var(--sql-border-color, var(--border-subtle, #374151))"}),a().createElement(f.W,{dataKey:U,tickFormatter:Y,type:"timeseries"===n?"number":"category",domain:"timeseries"===n?O?[O.left,O.right]:["auto","auto"]:void 0,stroke:"var(--sql-text-color, var(--text-secondary, #94a3b8))",tick:{fontSize:null!==(N=null==k?void 0:k.fontSize)&&void 0!==N?N:12,fill:"var(--sql-text-color, var(--text-secondary, #94a3b8))"}}),a().createElement(v.h,{stroke:"var(--sql-text-color, var(--text-secondary, #94a3b8))",type:H?"category":"number",domain:["auto","auto"],width:H?Math.max(120,10*(null!==(z=null==k?void 0:k.fontSize)&&void 0!==z?z:12)):60,tick:{fontSize:null!==(q=null==k?void 0:k.fontSize)&&void 0!==q?q:12,fill:"var(--sql-text-color, var(--text-secondary, #94a3b8))"}}),a().createElement(s.m,{labelFormatter:e=>Y(e),contentStyle:{backgroundColor:"var(--sql-row-bg, var(--surface-elevated, #111827))",borderColor:"var(--sql-border-color, var(--border-color, #374151))",color:"var(--sql-text-color, var(--text-primary, #f3f4f6))"}}),ie&&a().createElement(i.s),V.map((e,t)=>{const r=Number((null==k?void 0:k.scatterPointSize)||(null==k?void 0:k.dotSize))||5,o=1===V.length?le:h[t%h.length];return a().createElement(m.N1,{key:e,type:"scatter"===n?"linear":oe,dataKey:e,connectNulls:!0,stroke:"scatter"===n?"transparent":o,strokeWidth:2,activeDot:{r:r+3},dot:"scatter"===n?{r,fill:o}:!!ae&&{r:Number(null==k?void 0:k.dotSize)||3,stroke:o,fill:o},isAnimationActive:!1})}),(null==k?void 0:k.showTrendMarker)&&null!==P&&a().createElement(u.e_,{x:P,stroke:"var(--text-link, #3274D9)",strokeDasharray:"3 3"}),A&&T&&a().createElement(d.T,{x1:A,x2:T,strokeOpacity:.5,stroke:"#b4167e",fill:"#b4167e",fillOpacity:.3}))),O&&a().createElement("button",{type:"button",className:M.resetZoomBtn,onClick:e=>{null==e||e.stopPropagation(),B(null),j(null),F(null)},title:"Resetar zoom"},a().createElement("span",null,"↺")," Resetar Zoom"))),G>1&&a().createElement("div",{className:M.pagination},a().createElement("button",{className:M.pageButton,onClick:()=>L(e=>Math.max(0,e-1)),disabled:0===C,title:"Página Anterior"},"◀"),a().createElement("div",{className:M.pageInfo},a().createElement("span",null,R," itens (Pág ",C+1,"/",G,")")),a().createElement("button",{className:M.pageButton,onClick:()=>L(e=>Math.min(G-1,e+1)),disabled:C===G-1,title:"Próxima Página"},"▶")))}const E=e=>({container:n.css`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 200px;
    height: 100%;
    width: 100%;
    padding: ${e.spacing(1.5)};
    background: var(--sql-row-bg, var(--surface-primary));
    box-sizing: border-box;
  `,chartWrapper:n.css`
    position: relative;
    flex: 1;
    min-height: 140px;
    width: 100%;
  `,resetZoomBtn:n.css`
    position: absolute;
    top: 8px;
    right: 18px;
    z-index: 20;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(180, 22, 126, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    color: #ffffff;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    transition: background 0.2s, transform 0.15s;

    &:hover {
      background: #b4167e;
      transform: scale(1.05);
    }
  `,emptyState:n.css`
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 150px;
    color: var(--sql-text-color, var(--text-secondary));
    background: var(--sql-row-bg, var(--surface-primary));
  `,pagination:n.css`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 38px;
    flex-shrink: 0;
    border-top: 1px solid var(--sql-border-color, var(--border-color));
    color: var(--sql-text-color, var(--text-primary));
    padding-top: 6px;
    margin-top: 4px;
  `,pageButton:n.css`
    background: var(--button-bg, var(--surface-secondary));
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--sql-text-color, var(--text-primary));
    width: 36px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
    
    &:hover:not(:disabled) {
      background: var(--button-hover, var(--selection-bg));
      border-color: var(--accent);
    }
    
    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
  `,pageInfo:n.css`
    background: transparent;
    border: 1px solid var(--sql-border-color, var(--border-color));
    border-radius: 6px;
    color: var(--sql-text-color, var(--text-primary));
    padding: 0 12px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 500;
  `,gaugeContainer:n.css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    height: 100%;
    width: 100%;
    padding: 10px;
    box-sizing: border-box;
  `,gaugeSvgWrapper:n.css`
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 220px;
    height: 130px;
  `,gaugeValueDisplay:n.css`
    position: absolute;
    bottom: 16px;
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 4px;
  `,gaugeNumber:n.css`
    font-size: 28px;
    font-weight: 700;
    color: var(--sql-text-color, var(--text-primary, #f8fafc));
  `,gaugeUnit:n.css`
    font-size: 14px;
    font-weight: 500;
    color: var(--sql-text-color, var(--text-secondary, #94a3b8));
  `,gaugeLimits:n.css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 190px;
    font-size: 12px;
    color: var(--sql-text-color, var(--text-secondary, #94a3b8));
    margin-top: 4px;
  `,gaugeFieldLabel:n.css`
    color: var(--sql-text-color, var(--text-primary, #cbd5e1));
    font-weight: 500;
    font-size: 13px;
  `})}}]);
//# sourceMappingURL=401.js.map