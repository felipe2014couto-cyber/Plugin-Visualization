"use strict";(self.webpackChunkpims_vision_app_0_1_9=self.webpackChunkpims_vision_app_0_1_9||[]).push([[5],{9005(e,t,r){r.r(t),r.d(t,{SqlQueryPanel:()=>I});var a=r(5959),n=r.n(a),o=r(6089),s=r(2007);function l(e,t,r,a,n,o,s){try{var l=e[o](s),i=l.value}catch(e){return void r(e)}l.done?t(i):Promise.resolve(i).then(a,n)}function i({onConnect:e,isConnecting:t,error:r}){const o=(0,s.useStyles2)(c),[i,d]=(0,a.useState)(""),[u,m]=(0,a.useState)("");return n().createElement("div",{className:o.container},n().createElement("div",{className:o.header},n().createElement(s.Icon,{name:"database",size:"xxl",className:o.icon}),n().createElement("h2",{className:o.title},"Conexão SIP"),n().createElement("p",{className:o.subtitle},"Conecte-se ao SIP para executar consultas")),r&&n().createElement("div",{className:o.errorAlert},n().createElement(s.Icon,{name:"exclamation-triangle"}),n().createElement("span",null,r)),n().createElement("form",{onSubmit:t=>{return(r=function*(){if(t.preventDefault(),!i.trim())return;const r=i.trim(),a=u;d(""),m(""),yield e({username:r,password:a})},function(){var e=this,t=arguments;return new Promise(function(a,n){var o=r.apply(e,t);function s(e){l(o,a,n,s,i,"next",e)}function i(e){l(o,a,n,s,i,"throw",e)}s(void 0)})})();var r},className:o.form},n().createElement(s.Field,{label:"Usuário",description:"Usuário de acesso ao SIP"},n().createElement(s.Input,{value:i,onChange:e=>d(e.currentTarget.value),placeholder:"usuario",required:!0,autoComplete:"username"})),n().createElement(s.Field,{label:"Senha",description:"A senha não será salva e não persistirá no painel"},n().createElement(s.SecretInput,{value:u,onChange:e=>m(e.currentTarget.value),placeholder:"senha",required:!0,autoComplete:"current-password",isConfigured:!1,onReset:()=>m("")})),n().createElement("div",{className:o.actions},n().createElement(s.Button,{type:"submit",variant:"primary",disabled:t||!i||!u},t?"Conectando...":"Conectar ao SIP"))))}const c=e=>({container:o.css`
    display: flex;
    flex-direction: column;
    padding: ${e.spacing(4)};
    height: 100%;
    overflow-y: auto;
    color: var(--text-primary);
    background-color: var(--surface-secondary);
  `,header:o.css`
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: ${e.spacing(4)};
    text-align: center;
  `,icon:o.css`
    color: var(--accent);
    margin-bottom: ${e.spacing(2)};
  `,title:o.css`
    margin: 0 0 ${e.spacing(1)} 0;
  `,subtitle:o.css`
    margin: 0;
    color: var(--text-secondary);
  `,form:o.css`
    display: flex;
    flex-direction: column;
    gap: ${e.spacing(1)};
    max-width: 500px;
    margin: 0 auto;
    width: 100%;
    color: var(--text-primary);
    
    /* Aumentar o fundo do form */
    background: var(--surface-primary);
    padding: ${e.spacing(3)};
    border-radius: ${e.shape.borderRadius(2)};
    border: 1px solid var(--border-color);

    input {
      box-sizing: border-box;
      width: 100%;
      color: var(--text-primary) !important;
      background: var(--input-bg) !important;
      border-color: var(--border-color) !important;
    }

    input::placeholder {
      color: var(--text-secondary) !important;
      opacity: 0.8 !important;
    }

    label, small {
      color: var(--text-secondary);
    }

    label {
      color: var(--text-primary) !important;
    }

    /* Grafana's Field renders descriptions in a nested span. Keep them
       readable in both themes instead of inheriting the dark input color. */
    & > div > div > label > span,
    & > div > label > span {
      color: var(--text-secondary) !important;
      opacity: 1 !important;
      font-size: 12px;
      line-height: 1.35;
    }

    & > div {
      color: var(--text-secondary);
    }
  `,actions:o.css`
    display: flex;
    justify-content: flex-end;
    margin-top: ${e.spacing(2)};

    button {
      color: var(--accent-contrast) !important;
      background: var(--accent) !important;
      border-color: var(--accent) !important;
    }
  `,errorAlert:o.css`
    background-color: var(--surface-elevated);
    color: var(--danger);
    padding: ${e.spacing(2)};
    border-radius: ${e.shape.borderRadius(1)};
    border-left: 4px solid var(--danger);
    margin-bottom: ${e.spacing(3)};
    display: flex;
    align-items: flex-start;
    gap: ${e.spacing(1)};
    font-size: ${e.typography.size.sm};
    max-width: 500px;
    margin: 0 auto ${e.spacing(3)} auto;
    width: 100%;
  `});function d(e,t,r){return t in e?Object.defineProperty(e,t,{value:r,enumerable:!0,configurable:!0,writable:!0}):e[t]=r,e}function u(e){for(var t=1;t<arguments.length;t++){var r=null!=arguments[t]?arguments[t]:{},a=Object.keys(r);"function"==typeof Object.getOwnPropertySymbols&&(a=a.concat(Object.getOwnPropertySymbols(r).filter(function(e){return Object.getOwnPropertyDescriptor(r,e).enumerable}))),a.forEach(function(t){d(e,t,r[t])})}return e}function m(e,t){return t=null!=t?t:{},Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(t)):function(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(e);t&&(a=a.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),r.push.apply(r,a)}return r}(Object(t)).forEach(function(r){Object.defineProperty(e,r,Object.getOwnPropertyDescriptor(t,r))}),e}function p({isOpen:e,params:t,onConfirm:r,onDismiss:o}){const l=(0,s.useStyles2)(f),[i,c]=(0,a.useState)({});(0,a.useEffect)(()=>{e&&c(e=>{const r=u({},e);for(const e of t)void 0===r[e]&&(r[e]="");return r})},[e,t]);const d=()=>{c({}),o()};return e?n().createElement(s.Modal,{title:"Variáveis de Bind Encontradas",isOpen:e,onDismiss:d,onClickBackdrop:d,className:l.modal},n().createElement("div",{className:l.container},n().createElement("p",{className:l.description},"Preencha os valores para as variáveis identificadas no seu script SQL:"),n().createElement("div",{className:l.fields},t.map(e=>n().createElement(s.Field,{label:`:${e}`,key:e},n().createElement(s.Input,{value:i[e]||"",onChange:t=>((e,t)=>{c(r=>m(u({},r),{[e]:t}))})(e,t.currentTarget.value),placeholder:`Valor para ${e}...`,autoFocus:t[0]===e})))),n().createElement(s.Modal.ButtonRow,null,n().createElement(s.Button,{variant:"secondary",onClick:d,fill:"outline"},"Cancelar"),n().createElement(s.Button,{variant:"primary",onClick:()=>{const e=u({},i);c({}),r(e)}},"Executar Query")))):null}const f=e=>({modal:o.css`
    width: 500px;
  `,container:o.css`
    display: flex;
    flex-direction: column;
    gap: ${e.spacing(2)};
  `,description:o.css`
    color: ${e.colors.text.secondary};
    margin-bottom: ${e.spacing(2)};
  `,fields:o.css`
    display: flex;
    flex-direction: column;
    gap: ${e.spacing(1)};
    max-height: 400px;
    overflow-y: auto;
    padding-right: ${e.spacing(1)};
  `});var b=r(5341);function g(e,t,r,a,n,o,s){try{var l=e[o](s),i=l.value}catch(e){return void r(e)}l.done?t(i):Promise.resolve(i).then(a,n)}function v(e){return function(){var t=this,r=arguments;return new Promise(function(a,n){var o=e.apply(t,r);function s(e){g(o,a,n,s,l,"next",e)}function l(e){g(o,a,n,s,l,"throw",e)}s(void 0)})}}const x=[{id:"table",label:"Tabela",renderIcon:()=>n().createElement("svg",{width:"26",height:"26",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round"},n().createElement("rect",{x:"3",y:"3",width:"18",height:"18",rx:"2"}),n().createElement("line",{x1:"3",y1:"9",x2:"21",y2:"9"}),n().createElement("line",{x1:"3",y1:"15",x2:"21",y2:"15"}),n().createElement("line",{x1:"9",y1:"3",x2:"9",y2:"21"}),n().createElement("line",{x1:"15",y1:"3",x2:"15",y2:"21"}))},{id:"xy",label:"Gráfico XY",renderIcon:()=>n().createElement("svg",{width:"26",height:"26",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round"},n().createElement("path",{d:"M3 3v18h18"}),n().createElement("polyline",{points:"5 15 10 9 14 13 19 6"}),n().createElement("circle",{cx:"5",cy:"15",r:"1.5",fill:"currentColor"}),n().createElement("circle",{cx:"10",cy:"9",r:"1.5",fill:"currentColor"}),n().createElement("circle",{cx:"14",cy:"13",r:"1.5",fill:"currentColor"}),n().createElement("circle",{cx:"19",cy:"6",r:"1.5",fill:"currentColor"}))},{id:"timeseries",label:"Série temporal",renderIcon:()=>n().createElement("svg",{width:"26",height:"26",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round"},n().createElement("polyline",{points:"3 13 7 8 11 11 15 6 18 8"}),n().createElement("circle",{cx:"16",cy:"16",r:"4.5"}),n().createElement("polyline",{points:"16 13.5 16 16 18 16"}))},{id:"bar",label:"Gráfico de barras",renderIcon:()=>n().createElement("svg",{width:"26",height:"26",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round"},n().createElement("line",{x1:"3",y1:"20",x2:"21",y2:"20"}),n().createElement("rect",{x:"5",y:"11",width:"3",height:"9",rx:"0.5"}),n().createElement("rect",{x:"9.5",y:"5",width:"3",height:"15",rx:"0.5"}),n().createElement("rect",{x:"14",y:"8",width:"3",height:"12",rx:"0.5"}),n().createElement("rect",{x:"18.5",y:"13",width:"2",height:"7",rx:"0.5"}))},{id:"gauge",label:"Gauge",renderIcon:()=>n().createElement("svg",{width:"26",height:"26",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round"},n().createElement("circle",{cx:"12",cy:"12",r:"9",strokeDasharray:"2.5 2.5"}),n().createElement("line",{x1:"12",y1:"12",x2:"16.5",y2:"7.5"}),n().createElement("circle",{cx:"12",cy:"12",r:"2",fill:"currentColor"}))},{id:"scatter",label:"Dispersão",renderIcon:()=>n().createElement("svg",{width:"26",height:"26",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round"},n().createElement("path",{d:"M3 3v18h18"}),n().createElement("circle",{cx:"7",cy:"14",r:"1.5",fill:"currentColor"}),n().createElement("circle",{cx:"10",cy:"8",r:"1.5",fill:"currentColor"}),n().createElement("circle",{cx:"12",cy:"15",r:"1.5",fill:"currentColor"}),n().createElement("circle",{cx:"14",cy:"10",r:"1.5",fill:"currentColor"}),n().createElement("circle",{cx:"16",cy:"6",r:"1.5",fill:"currentColor"}),n().createElement("circle",{cx:"18",cy:"13",r:"1.5",fill:"currentColor"}))}],h=["#22c55e","#eab308","#ef4444","#3b82f6","#b4167e","#8b5cf6","#06b6d4","#f97316","#10b981","#f43f5e","#64748b","#ffffff"];function y({onExecute:e,onDisconnect:t,isExecuting:r,error:l,lastResult:i,sqlToLoad:c,onConfigChange:d,onApplyToDashboard:u,initialConfig:m}){var f,b,g;const y=(0,s.useStyles2)(E),[w,N]=(0,a.useState)(void 0!==c?c:""),S=e=>{N(e)},[C,I]=(0,a.useState)(200),[P,L]=(0,a.useState)(!1),[k,O]=(0,a.useState)([]),[_,R]=(0,a.useState)(null!==(f=null==m?void 0:m.viewMode)&&void 0!==f?f:"table"),[A,j]=(0,a.useState)(!1),D=(null==i||null===(b=i.rows)||void 0===b?void 0:b[0])?Object.keys(i.rows[0]):["DTH_INIC_PROCE","VALOR","COD_EQPMT_PRODC","TS","COD_IDENT_UNMET"],[T,B]=(0,a.useState)((null==m?void 0:m.xAxis)||D[0]||"DTH_INIC_PROCE"),[F,z]=(0,a.useState)((null==m||null===(g=m.yAxes)||void 0===g?void 0:g[0])||D[1]||"VALOR"),[M,$]=(0,a.useState)("Todas"),[q,V]=(0,a.useState)(D[0]||"DTH_INIC_PROCE"),[U,H]=(0,a.useState)("Crescente"),[Q,W]=(0,a.useState)("25"),[G,K]=(0,a.useState)(!0),[Y,X]=(0,a.useState)(!0),[J,Z]=(0,a.useState)("100"),[ee,te]=(0,a.useState)("Linear"),[re,ae]=(0,a.useState)(!0),[ne,oe]=(0,a.useState)(!0),[se,le]=(0,a.useState)(D[0]||"DTH_INIC_PROCE"),[ie,ce]=(0,a.useState)(D[1]||"VALOR"),[de,ue]=(0,a.useState)("Automático"),[me,pe]=(0,a.useState)(!1),[fe,be]=(0,a.useState)(!0),[ge,ve]=(0,a.useState)(D[0]||"DTH_INIC_PROCE"),[xe,he]=(0,a.useState)(D[1]||"VALOR"),[ye,Ee]=(0,a.useState)("100"),[we,Ne]=(0,a.useState)("Nenhum"),[Se,Ce]=(0,a.useState)("Vertical"),[Ie,Pe]=(0,a.useState)(!0),[Le,ke]=(0,a.useState)(!1),[Oe,_e]=(0,a.useState)("#b4167e"),[Re,Ae]=(0,a.useState)(!1),[je,De]=(0,a.useState)(D[1]||"VALOR"),[Te,Be]=(0,a.useState)(0),[Fe,ze]=(0,a.useState)(100),[Me,$e]=(0,a.useState)("%"),[qe,Ve]=(0,a.useState)(!0),[Ue,He]=(0,a.useState)("1"),[Qe,We]=(0,a.useState)("#22c55e"),[Ge,Ke]=(0,a.useState)("#eab308"),[Ye,Xe]=(0,a.useState)("#ef4444"),[Je,Ze]=(0,a.useState)(null),[et,tt]=(0,a.useState)(!0),[rt,at]=(0,a.useState)(D[0]||"DTH_INIC_PROCE"),[nt,ot]=(0,a.useState)(D[1]||"VALOR"),[st,lt]=(0,a.useState)("100"),[it,ct]=(0,a.useState)("5"),[dt,ut]=(0,a.useState)("Nenhum"),[mt,pt]=(0,a.useState)("Nenhum"),[ft,bt]=(0,a.useState)(!1),[gt,vt]=(0,a.useState)(!0);(0,a.useEffect)(()=>{void 0!==c&&N(c)},[c]),(0,a.useEffect)(()=>{if((null==i?void 0:i.rows)&&i.rows.length>0){const e=Object.keys(i.rows[0]);if(e.length>0){const t=e.find(e=>{const t=e.toLowerCase();return"ts"===t||"time"===t||"data"===t||t.includes("date")||t.includes("dth")||t.includes("hora")||t.includes("tempo")})||e[0],r=e.find(e=>{const t=e.toLowerCase();return"pi_value"===t||"valor"===t||"val"===t||"value"===t||"y"===t||t.includes("medida")||t.includes("total")||t.includes("qtde")})||e.find(e=>e!==t&&"number"==typeof i.rows[0][e])||(e.length>1?e[1]:e[0]);B(t),z(r),V(t),le(t),ce(r),ve(t),he(r),De(r),at(t),ot(r)}}},[i]);const xt=()=>{let e=T,t=[F];return"bar"===_?(e=ge,t=[xe]):"timeseries"===_?(e=se,t=[ie]):"gauge"===_?(e=D[0],t=[je]):"scatter"===_&&(e=rt,t=[nt]),{viewMode:_,xAxis:e,yAxes:t,tableVisibleCols:M,tableSortBy:q,tableOrder:U,tableRowsPerPage:Number(Q)||25,tableColumnFilters:G,tableAdjustWidth:Y,xyRowsPerPage:Number(J)||100,paginationSize:"xy"===_?Number(J)||100:Number(Q)||25,xyLineType:ee,xyShowPoints:re,xyLegend:ne,timeDateField:se,timeValueField:ie,timeInterval:de,timeFillGaps:me,timeLegend:fe,barXAxis:ge,barYAxis:xe,barRowsPerPage:Number(ye)||100,barGroupBy:we,barOrientation:Se,barLegend:Ie,barShowValues:Le,barColor:Oe,gaugeNumericField:je,gaugeMin:Te,gaugeMax:Fe,gaugeUnit:Me,gaugeShowValue:qe,gaugeDecimals:Number(Ue)||1,gaugeColor1:Qe,gaugeColor2:Ge,gaugeColor3:Ye,gaugeLegend:et,scatterXAxis:rt,scatterYAxis:nt,scatterRowsPerPage:Number(st)||100,scatterPointSize:Number(it)||5,scatterColorBy:dt,scatterGroupBy:mt,scatterTrendLine:ft,scatterLegend:gt}};(0,a.useEffect)(()=>{null==d||d(xt())},[_,T,F,M,q,U,Q,G,Y,ee,re,ne,J,se,ie,de,me,fe,ge,xe,ye,we,Se,Ie,Le,Oe,je,Te,Fe,Me,qe,Ue,Qe,Ge,Ye,et,rt,nt,st,it,dt,mt,ft,gt]);const ht=()=>v(function*(){if(!w.trim()||r)return;const t=Array.from(w.matchAll(/(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g)),a=Array.from(new Set(t.map(e=>e[1])));a.length>0?(O(a),L(!0)):yield e(w,C)})(),yt=(e,t)=>n().createElement("button",{type:"button",className:(0,o.cx)(y.switchTrack,e&&y.switchTrackActive),onClick:()=>t(!e),"aria-checked":e,role:"switch"},n().createElement("span",{className:(0,o.cx)(y.switchKnob,e&&y.switchKnobActive)})),Et=(e,t,r)=>n().createElement("div",{className:y.segmentedContainer},e.map(e=>n().createElement("button",{key:e,type:"button",className:(0,o.cx)(y.segmentedBtn,t===e&&y.segmentedBtnActive),onClick:()=>r(e)},e))),wt=(e,t,r)=>n().createElement("div",{className:y.selectWrapper},n().createElement("select",{className:y.nativeSelect,value:e,onChange:e=>t(e.target.value)},r.map(e=>n().createElement("option",{key:e,value:e},e))),n().createElement("span",{className:y.selectChevron},n().createElement(s.Icon,{name:"angle-down"})));return n().createElement("div",{className:y.container},n().createElement("div",{className:y.toolbar},n().createElement("div",{className:y.toolbarLeft},n().createElement(s.Icon,{name:"database",className:y.dbIcon}),n().createElement("span",{className:y.statusDot}),n().createElement("span",{className:y.connectionStatus},"Conectado ao SIP")),n().createElement("button",{type:"button",className:y.disconnectButton,onClick:t,title:"Desconectar"},n().createElement(s.Icon,{name:"signout"}),n().createElement("span",null,"Desconectar"))),n().createElement("div",{className:y.editorArea},n().createElement("textarea",{className:y.textarea,value:w,onChange:e=>S(e.target.value),onKeyDown:e=>{"Enter"===e.key&&e.ctrlKey&&(e.preventDefault(),ht())},placeholder:"Digite sua consulta SQL aqui (SELECT / WITH; final opcional)...\nPressione Ctrl+Enter para executar.",spellCheck:!1,disabled:r}),n().createElement("p",{className:y.securityNotice},"A consulta SQL pode ser salva com este painel. Não coloque senhas ou segredos diretamente no SQL; use parâmetros."),n().createElement("div",{className:y.editorControls},n().createElement("div",{className:y.limitControl},n().createElement("span",{className:y.limitLabel},"Limite de linhas"),n().createElement(s.Input,{type:"number",min:1,max:2e3,value:C,onChange:e=>I(parseInt(e.currentTarget.value,10)||200),className:y.limitInput,disabled:r})),n().createElement("div",{className:y.actionButtons},n().createElement("button",{type:"button",className:y.clearButton,onClick:()=>S(""),disabled:r||!w},"Limpar"),n().createElement("button",{type:"button",className:y.runButton,onClick:ht,disabled:r||!w.trim()},n().createElement(s.Icon,{name:"play"}),n().createElement("span",null,r?"Executando...":"Executar (Ctrl+Enter)")))),l&&n().createElement("div",{className:y.errorAlert},n().createElement(s.Icon,{name:"exclamation-triangle"}),n().createElement("span",null,l)),n().createElement("div",{className:y.visualGrid},x.map(e=>{const t=_===e.id;return n().createElement("button",{key:e.id,type:"button",className:(0,o.cx)(y.visualCard,t&&y.visualCardActive),onClick:()=>R(e.id)},n().createElement("div",{className:y.visualCardIcon},e.renderIcon()),n().createElement("span",{className:y.visualCardLabel},e.label))})),n().createElement("div",{className:y.configContainer},n().createElement("div",{className:y.configHeader,onClick:()=>j(!A)},n().createElement("span",null,"Configurações do gráfico"),n().createElement(s.Icon,{name:A?"angle-down":"angle-up"})),!A&&n().createElement("div",{className:y.configBody},"table"===_&&n().createElement(n().Fragment,null,n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Colunas visíveis"),wt(M,$,["Todas",...D])),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Ordenar por"),wt(q,V,D)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Ordem"),Et(["Crescente","Decrescente"],U,H)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Linhas por página"),wt(Q,W,["10","25","50","100"])),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Filtros por coluna"),yt(G,K)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Ajustar largura"),yt(Y,X))),"xy"===_&&n().createElement(n().Fragment,null,n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Eixo X"),wt(T,B,D)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Eixo Y"),wt(F,z,D)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Linhas por página"),wt(J,Z,["10","25","50","100","200","500"])),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Tipo de linha"),wt(ee,te,["Linear","Suave","Degrau"])),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Mostrar pontos"),yt(re,ae)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Legenda"),yt(ne,oe))),"timeseries"===_&&n().createElement(n().Fragment,null,n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Campo de data"),wt(se,le,D)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Campo de valor"),wt(ie,ce,D)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Intervalo"),wt(de,ue,["Automático","1m","5m","15m","1h","1d"])),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Preencher lacunas"),yt(me,pe)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Legenda"),yt(fe,be))),"bar"===_&&n().createElement(n().Fragment,null,n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Eixo X"),wt(ge,ve,D)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Eixo Y"),wt(xe,he,D)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Linhas por página"),wt(ye,Ee,["10","25","50","100","200","500"])),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Agrupamento"),wt(we,Ne,["Nenhum",...D])),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Orientação"),Et(["Vertical","Horizontal"],Se,Ce)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Legenda"),yt(Ie,Pe)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Mostrar valores"),yt(Le,ke)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Cor das barras"),n().createElement("div",{style:{position:"relative"}},n().createElement("button",{type:"button",className:y.colorPickerBtn,onClick:()=>Ae(!Re)},n().createElement("span",{className:y.colorPreview,style:{backgroundColor:Oe}}),n().createElement(s.Icon,{name:"angle-down"})),Re&&n().createElement("div",{className:y.colorDropdown},h.map(e=>n().createElement("button",{key:e,type:"button",className:y.colorSwatch,style:{backgroundColor:e},onClick:()=>{_e(e),Ae(!1)}})))))),"gauge"===_&&n().createElement(n().Fragment,null,n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Campo numérico"),wt(je,De,D)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Valor mínimo"),n().createElement("input",{type:"number",className:y.numberInput,value:Te,onChange:e=>Be(Number(e.target.value))})),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Valor máximo"),n().createElement("input",{type:"number",className:y.numberInput,value:Fe,onChange:e=>ze(Number(e.target.value))})),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Unidade"),wt(Me,$e,["%","°C","bar","kg/h","rpm","m³/h","V","A","kW"])),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Faixas"),n().createElement("div",{style:{position:"relative"}},n().createElement("div",{className:y.thresholdsRow},n().createElement("button",{type:"button",className:y.thresholdBoxBtn,style:{backgroundColor:Qe},title:"Faixa Normal (clique para trocar a cor)",onClick:()=>Ze(1===Je?null:1)}),n().createElement("button",{type:"button",className:y.thresholdBoxBtn,style:{backgroundColor:Ge},title:"Faixa Alerta (clique para trocar a cor)",onClick:()=>Ze(2===Je?null:2)}),n().createElement("button",{type:"button",className:y.thresholdBoxBtn,style:{backgroundColor:Ye},title:"Faixa Crítica (clique para trocar a cor)",onClick:()=>Ze(3===Je?null:3)})),null!==Je&&n().createElement("div",{className:y.colorDropdown},h.map(e=>n().createElement("button",{key:e,type:"button",className:y.colorSwatch,style:{backgroundColor:e},onClick:()=>{1===Je?We(e):2===Je?Ke(e):3===Je&&Xe(e),Ze(null)}}))))),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Legenda"),yt(et,tt)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Mostrar valor"),yt(qe,Ve)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Casas decimais"),wt(Ue,He,["0","1","2","3"]))),"scatter"===_&&n().createElement(n().Fragment,null,n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Eixo X"),wt(rt,at,D)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Eixo Y"),wt(nt,ot,D)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Linhas por página"),wt(st,lt,["10","25","50","100","200","500"])),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Tamanho do ponto"),wt(it,ct,["3","5","8","10","12"])),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Cor por"),wt(dt,ut,["Nenhum",...D])),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Agrupar por"),wt(mt,pt,["Nenhum",...D])),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Linha de tendência"),yt(ft,bt)),n().createElement("div",{className:y.formRow},n().createElement("span",{className:y.fieldLabel},"Legenda"),yt(gt,vt))))),n().createElement("button",{type:"button",className:y.applyButton,onClick:()=>v(function*(){!i&&w.trim()&&(yield ht()),null==u||u(xt())})(),disabled:Boolean(r)},n().createElement(s.Icon,{name:"play"}),n().createElement("span",null,"Aplicar visualização"))),n().createElement(p,{isOpen:P,params:k,onConfirm:t=>v(function*(){L(!1),yield e(w,C,t)})(),onDismiss:()=>L(!1)}))}const E=e=>({container:o.css`
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow-y: auto;
    background: var(--surface-primary);
    color: var(--text-primary);
  `,toolbar:o.css`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: var(--panel-header-bg, var(--surface-secondary));
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
  `,toolbarLeft:o.css`
    display: flex;
    align-items: center;
    gap: 8px;
  `,dbIcon:o.css`
    color: var(--text-secondary);
    font-size: 16px;
  `,statusDot:o.css`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--success, #22c55e);
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.7);
    display: inline-block;
  `,connectionStatus:o.css`
    color: var(--success, #22c55e);
    font-size: 13px;
    font-weight: 500;
  `,disconnectButton:o.css`
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: var(--danger, #f43f5e);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    transition: opacity 0.2s, background-color 0.2s;

    &:hover {
      background-color: rgba(244, 63, 94, 0.1);
      opacity: 0.9;
    }
  `,editorArea:o.css`
    display: flex;
    flex-direction: column;
    padding: 14px;
    gap: 12px;
  `,textarea:o.css`
    width: 100%;
    min-height: 140px;
    background-color: var(--input-bg);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 12px;
    color: var(--text-primary);
    font-family: 'JetBrains Mono', 'Fira Code', Consolas, Monaco, monospace;
    font-size: 13px;
    line-height: 1.5;
    resize: vertical;
    box-sizing: border-box;
    
    &:focus {
      outline: none;
      border-color: var(--accent, #b4167e);
      box-shadow: 0 0 0 1px var(--accent, #b4167e);
    }
    
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `,securityNotice:o.css`
    margin: -4px 0 2px 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-secondary);
    opacity: 0.85;
  `,editorControls:o.css`
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-end;
    gap: 10px;
  `,limitControl:o.css`
    display: flex;
    flex-direction: column;
    gap: 4px;
  `,limitLabel:o.css`
    color: var(--text-secondary);
    font-size: 12px;
  `,limitInput:o.css`
    width: 110px;
    input {
      background: var(--input-bg) !important;
      border-color: var(--border-color) !important;
      color: var(--text-primary) !important;
      height: 34px !important;
      border-radius: 4px !important;
      font-size: 13px !important;
    }
  `,actionButtons:o.css`
    display: flex;
    align-items: center;
    gap: 8px;
  `,clearButton:o.css`
    background: var(--button-bg);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    height: 34px;
    padding: 0 16px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      background: var(--button-hover);
      border-color: var(--accent, #b4167e);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,runButton:o.css`
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--accent, #b4167e);
    border: 1px solid var(--accent, #b4167e);
    color: var(--accent-contrast, #ffffff);
    height: 34px;
    padding: 0 16px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      background: var(--accent-hover, #9d126e);
      border-color: var(--accent-hover, #9d126e);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `,errorAlert:o.css`
    background-color: rgba(239, 68, 68, 0.15);
    color: var(--danger, #f87171);
    padding: 10px 12px;
    border-radius: 6px;
    border-left: 3px solid var(--danger, #ef4444);
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 12px;
  `,visualGrid:o.css`
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-top: 4px;
  `,visualCard:o.css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--surface-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 14px 6px;
    cursor: pointer;
    transition: all 0.15s ease-in-out;
    color: var(--text-secondary);

    &:hover {
      border-color: var(--accent, #b4167e);
      background: var(--selection-bg);
      color: var(--text-primary);
    }
  `,visualCardActive:o.css`
    border: 2px solid var(--accent, #b4167e) !important;
    background: var(--selection-bg) !important;
    color: var(--accent, #b4167e) !important;
    box-shadow: 0 0 10px var(--focus-ring);
  `,visualCardIcon:o.css`
    display: flex;
    align-items: center;
    justify-content: center;
    color: currentColor;
  `,visualCardLabel:o.css`
    font-size: 12px;
    font-weight: 500;
    margin-top: 8px;
    text-align: center;
    color: inherit;
  `,configContainer:o.css`
    background: var(--surface-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 4px;
  `,configHeader:o.css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
  `,configBody:o.css`
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 6px;
  `,formRow:o.css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 32px;
  `,fieldLabel:o.css`
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 400;
    flex: 1;
    white-space: nowrap;
  `,selectWrapper:o.css`
    position: relative;
    width: 60%;
    max-width: 190px;
  `,nativeSelect:o.css`
    width: 100%;
    height: 32px;
    background: var(--input-bg);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 13px;
    line-height: 30px;
    padding: 0 28px 0 12px;
    appearance: none;
    cursor: pointer;
    outline: none;
    text-align: left;

    &:focus {
      border-color: var(--accent, #b4167e);
    }
  `,selectChevron:o.css`
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: var(--text-secondary);
    font-size: 12px;
  `,segmentedContainer:o.css`
    display: flex;
    width: 60%;
    max-width: 190px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    overflow: hidden;
    background: var(--input-bg);
  `,segmentedBtn:o.css`
    flex: 1;
    height: 30px;
    font-size: 12px;
    font-weight: 500;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0 4px;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      color: var(--text-primary);
    }
  `,segmentedBtnActive:o.css`
    background: var(--accent, #b4167e) !important;
    color: var(--accent-contrast, #ffffff) !important;
    font-weight: 600 !important;
  `,switchTrack:o.css`
    width: 36px;
    height: 20px;
    border-radius: 10px;
    background: var(--border-color, #94a3b8);
    border: none;
    cursor: pointer;
    position: relative;
    padding: 0;
    transition: background-color 0.2s;
  `,switchTrackActive:o.css`
    background: var(--accent, #b4167e) !important;
  `,switchKnob:o.css`
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ffffff;
    transition: left 0.2s;
  `,switchKnobActive:o.css`
    left: 18px !important;
  `,numberInput:o.css`
    width: 60%;
    max-width: 190px;
    height: 32px;
    background: var(--input-bg);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 12px;
    padding: 0 10px;
    outline: none;
    box-sizing: border-box;

    &:focus {
      border-color: var(--accent, #b4167e);
    }
  `,colorPickerBtn:o.css`
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--input-bg);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 5px 8px;
    cursor: pointer;
    color: var(--text-secondary);
  `,colorPreview:o.css`
    width: 28px;
    height: 18px;
    border-radius: 3px;
    display: inline-block;
  `,colorDropdown:o.css`
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background: var(--surface-elevated, var(--card-bg, #1e293b));
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 8px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    z-index: 50;
    box-shadow: var(--shadow, 0 4px 12px rgba(0, 0, 0, 0.25));
  `,colorSwatch:o.css`
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    cursor: pointer;
    padding: 0;

    &:hover {
      transform: scale(1.1);
    }
  `,thresholdsRow:o.css`
    display: flex;
    align-items: center;
    gap: 8px;
  `,thresholdBoxBtn:o.css`
    width: 28px;
    height: 22px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    padding: 0;

    &:hover {
      transform: scale(1.1);
      box-shadow: 0 0 6px rgba(255, 255, 255, 0.3);
    }
  `,thresholdBox:o.css`
    width: 24px;
    height: 20px;
    border-radius: 4px;
    display: inline-block;
  `,applyButton:o.css`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 38px;
    background: var(--accent, #b4167e);
    border: 1px solid var(--accent, #b4167e);
    border-radius: 6px;
    color: var(--accent-contrast, #ffffff);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s, opacity 0.2s;
    margin-top: 6px;

    &:hover:not(:disabled) {
      background: var(--accent-hover, #9d126e);
      border-color: var(--accent-hover, #9d126e);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `});function w(e,t,r,a,n,o,s){try{var l=e[o](s),i=l.value}catch(e){return void r(e)}l.done?t(i):Promise.resolve(i).then(a,n)}function N(e){return function(){var t=this,r=arguments;return new Promise(function(a,n){var o=e.apply(t,r);function s(e){w(o,a,n,s,l,"next",e)}function l(e){w(o,a,n,s,l,"throw",e)}s(void 0)})}}function S(e,t,r){return t in e?Object.defineProperty(e,t,{value:r,enumerable:!0,configurable:!0,writable:!0}):e[t]=r,e}function C(e,t){return t=null!=t?t:{},Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(t)):function(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(e);t&&(a=a.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),r.push.apply(r,a)}return r}(Object(t)).forEach(function(r){Object.defineProperty(e,r,Object.getOwnPropertyDescriptor(t,r))}),e}function I({onResultChange:e,onApplyToDashboard:t,onConfigChange:r,sqlToLoad:o,initialConfig:l}){const c=(0,s.useStyles2)(P),[d,u]=(0,a.useState)(!1),m=(0,a.useRef)(null),p=(0,a.useRef)(!0),[f,g]=(0,a.useState)(!1),[v,x]=(0,a.useState)(),[h,E]=(0,a.useState)(!1),[w,I]=(0,a.useState)(),[L,k]=(0,a.useState)(null),[O,_]=(0,a.useState)(l);(0,a.useEffect)(()=>()=>{var e;p.current=!1,null===(e=m.current)||void 0===e||e.abort()},[]);return n().createElement("div",{className:c.container},d?n().createElement(y,{onExecute:(t,r,a)=>N(function*(){if(!d)return null;E(!0),I(void 0);try{var n,o,s;null===(o=m.current)||void 0===o||o.abort(),m.current=new AbortController;const l=yield(0,b.Kq)({sql:t,max_rows:r,params:a,signal:m.current.signal});if(!p.current)return null;k(l);let i=null==O?void 0:O.xAxis,c=null==O||null===(s=O.yAxes)||void 0===s?void 0:s[0];if(l.rows&&l.rows.length>0){const e=Object.keys(l.rows[0]);if(e.length>0){const t=e.find(e=>{const t=e.toLowerCase();return"ts"===t||"time"===t||"data"===t||t.includes("date")||t.includes("dth")||t.includes("hora")||t.includes("tempo")})||e[0],r=e.find(e=>{const t=e.toLowerCase();return"pi_value"===t||"valor"===t||"val"===t||"value"===t||"y"===t||t.includes("medida")||t.includes("total")||t.includes("qtde")})||e.find(e=>e!==t&&"number"==typeof l.rows[0][e])||(e.length>1?e[1]:e[0]);i=i&&e.includes(i)?i:t,c=c&&e.includes(c)?c:r}}const d=C(function(e){for(var t=1;t<arguments.length;t++){var r=null!=arguments[t]?arguments[t]:{},a=Object.keys(r);"function"==typeof Object.getOwnPropertySymbols&&(a=a.concat(Object.getOwnPropertySymbols(r).filter(function(e){return Object.getOwnPropertyDescriptor(r,e).enumerable}))),a.forEach(function(t){S(e,t,r[t])})}return e}({viewMode:null!==(n=null==O?void 0:O.viewMode)&&void 0!==n?n:"xy"},O||{}),{xAxis:i,yAxes:c?[c]:[]});return null==e||e(l,t,d),l}catch(e){return p.current?(e instanceof b.l&&"SIP_SESSION_EXPIRED"===e.code&&u(!1),I(e.message||"Falha ao executar consulta"),null):null}finally{p.current&&E(!1)}})(),onDisconnect:()=>N(function*(){var e;null===(e=m.current)||void 0===e||e.abort(),yield(0,b.nM)(),u(!1),I(void 0)})(),onConfigChange:e=>{_(e),null==r||r(e)},onApplyToDashboard:t,isExecuting:h,error:w,lastResult:L,showResult:!0,sqlToLoad:o,initialConfig:l}):n().createElement(i,{onConnect:e=>N(function*(){g(!0),x(void 0);try{var t;null===(t=m.current)||void 0===t||t.abort(),m.current=new AbortController,yield(0,b.bF)(e,m.current.signal),p.current&&u(!0)}catch(e){if(p.current){const t="string"==typeof(null==e?void 0:e.message)&&"[object Object]"!==e.message?e.message:"string"==typeof e?e:"Falha ao conectar ao banco de dados";x(t)}}finally{p.current&&g(!1)}})(),isConnecting:f,error:v}))}const P=e=>({container:o.css`
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    color: var(--text-primary);
    background-color: var(--surface-primary);
  `})},5341(e,t,r){function a(e,t,r,a,n,o,s){try{var l=e[o](s),i=l.value}catch(e){return void r(e)}l.done?t(i):Promise.resolve(i).then(a,n)}function n(e){return function(){var t=this,r=arguments;return new Promise(function(n,o){var s=e.apply(t,r);function l(e){a(s,n,o,l,i,"next",e)}function i(e){a(s,n,o,l,i,"throw",e)}l(void 0)})}}function o(e,t,r){return t in e?Object.defineProperty(e,t,{value:r,enumerable:!0,configurable:!0,writable:!0}):e[t]=r,e}function s(e){for(var t=1;t<arguments.length;t++){var r=null!=arguments[t]?arguments[t]:{},a=Object.keys(r);"function"==typeof Object.getOwnPropertySymbols&&(a=a.concat(Object.getOwnPropertySymbols(r).filter(function(e){return Object.getOwnPropertyDescriptor(r,e).enumerable}))),a.forEach(function(t){o(e,t,r[t])})}return e}function l(e,t){return t=null!=t?t:{},Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(t)):function(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(e);t&&(a=a.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),r.push.apply(r,a)}return r}(Object(t)).forEach(function(r){Object.defineProperty(e,r,Object.getOwnPropertyDescriptor(t,r))}),e}r.d(t,{Kq:()=>f,bF:()=>m,l:()=>c,nM:()=>p});const i={SIP_AUTH_FAILED:"Usuário ou senha inválidos.",SIP_SESSION_EXPIRED:"A sessão SIP expirou. Conecte-se novamente.",SIP_QUERY_REJECTED:"A consulta foi rejeitada pela política de leitura do SIP.",SIP_QUERY_TIMEOUT:"A consulta excedeu o tempo máximo permitido.",SIP_QUERY_LIMIT:"O limite de consultas ou resultados foi atingido.",SIP_DATABASE_UNAVAILABLE:"O serviço SIP está indisponível no momento.",SIP_INVALID_PARAMETERS:"Os parâmetros informados são inválidos.",SIP_RATE_LIMIT:"Muitas solicitações. Aguarde e tente novamente.",SIP_ORIGIN_REJECTED:"A origem desta solicitação não é permitida."};class c extends Error{constructor(e,t,r,a){super(e),o(this,"code",void 0),o(this,"requestId",void 0),o(this,"status",void 0),this.code=t,this.requestId=r,this.status=a,this.name="OracleApiError"}}function d(e){return"number"==typeof e&&Number.isFinite(e)&&e>=0}function u(e,t,r){return n(function*(){const a=new AbortController,o=t.signal,d=()=>a.abort();null==o||o.addEventListener("abort",d,{once:!0});const u=window.setTimeout(()=>a.abort(),r);try{const r=yield fetch(`${function(){var e;if("undefined"!=typeof window&&window.__PIMS_SIP_API_BASE_URL__)return window.__PIMS_SIP_API_BASE_URL__.replace(/\/$/,"");if("undefined"!=typeof window&&(null===(e=window.location)||void 0===e?void 0:e.hostname)){const e=window.location.hostname;if("localhost"===e||"127.0.0.1"===e||/^10\.|^192\.168\.|^172\./.test(e))return`${window.location.protocol}//${e}:8085`}return window.location.protocol+"//"+window.location.hostname+":8085"}()}${e}`,l(s({},t),{credentials:"include",cache:"no-store",signal:a.signal,headers:s({"Content-Type":"application/json"},t.headers||{})}));if(!r.ok)throw yield function(e){return n(function*(){var t;let r;(null===(t=e.headers.get("content-type"))||void 0===t?void 0:t.toLowerCase().includes("application/json"))&&(r=yield e.json().catch(()=>{}));const a=null==r?void 0:r.detail;let n,o,s;if("object"==typeof a&&null!==a){const t=a;n="string"==typeof t.code?t.code:401===e.status?"SIP_AUTH_FAILED":429===e.status?"SIP_RATE_LIMIT":"SIP_REQUEST_FAILED",o="string"==typeof t.request_id?t.request_id:void 0,"string"==typeof t.msg&&(s=t.msg)}else"string"==typeof a?(n=401===e.status?"SIP_AUTH_FAILED":429===e.status?"SIP_RATE_LIMIT":"SIP_REQUEST_FAILED",s=a):(n=(null==r?void 0:r.code)||(401===e.status?"SIP_AUTH_FAILED":429===e.status?"SIP_RATE_LIMIT":"SIP_REQUEST_FAILED"),o=null==r?void 0:r.request_id);return o=o||e.headers.get("x-request-id")||void 0,new c(`${s||i[n]||"A operação SIP não pôde ser concluída."}${o?` (Código de suporte: ${o})`:""}`,n,o,e.status)})()}(r);return function(e){var t,r;if(!(null!==(t=null===(r=e.headers.get("content-type"))||void 0===r?void 0:r.toLowerCase())&&void 0!==t?t:"").includes("application/json"))throw new c("Resposta inválida recebida do serviço SIP.","SIP_INVALID_RESPONSE",void 0,e.status)}(r),r}catch(e){if(e instanceof c)throw e;if(a.signal.aborted)throw new c("A operação SIP excedeu o tempo limite.","SIP_REQUEST_TIMEOUT");throw new c("Não foi possível comunicar com o serviço SIP.","SIP_NETWORK_ERROR")}finally{window.clearTimeout(u),null==o||o.removeEventListener("abort",d)}})()}function m(e,t){return n(function*(){const r=yield u("/connect",{method:"POST",signal:t,body:JSON.stringify({connectionProfile:"sip",username:e.username,password:e.password||""})},15e3),a=yield r.json();if(!0!==a.connected)throw new c("Resposta inválida recebida do serviço SIP.","SIP_INVALID_RESPONSE");return a})()}function p(e){return n(function*(){yield u("/disconnect",{method:"POST",signal:e,body:"{}"},8e3).catch(()=>{})})()}function f(e){return n(function*(){var t;const r=Number(null!==(t=e.max_rows)&&void 0!==t?t:200),a=Number.isFinite(r)?Math.min(2e3,Math.max(1,Math.trunc(r))):200,n=yield u("/query",{method:"POST",signal:e.signal,body:JSON.stringify({sql:e.sql,max_rows:a,params:e.params||{}})},35e3),o=yield n.json();if(!Array.isArray(o.rows)||!d(o.row_count)||!d(o.max_rows))throw new c("Resposta inválida recebida do serviço SIP.","SIP_INVALID_RESPONSE");if(o.rows.some(e=>!e||"object"!=typeof e||Array.isArray(e)))throw new c("Resposta inválida recebida do serviço SIP.","SIP_INVALID_RESPONSE");return o})()}}}]);
//# sourceMappingURL=5.daca6909.js.map