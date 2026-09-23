"use strict";(self.webpackChunkpims_vision_app_0_1_9=self.webpackChunkpims_vision_app_0_1_9||[]).push([[5],{9005(e,t,a){a.r(t),a.d(t,{SqlQueryPanel:()=>k});var r=a(5959),n=a.n(r),o=a(6089),l=a(2007);function s({onConnect:e,isConnecting:t,error:a}){const o=(0,l.useStyles2)(c),[s,i]=(0,r.useState)(""),[d,m]=(0,r.useState)("");return n().createElement("div",{className:o.container},n().createElement("div",{className:o.header},n().createElement(l.Icon,{name:"database",size:"xxl",className:o.icon}),n().createElement("h2",{className:o.title},"Conexão SIP"),n().createElement("p",{className:o.subtitle},"Conecte-se ao SIP para executar consultas")),a&&n().createElement("div",{className:o.errorAlert},n().createElement(l.Icon,{name:"exclamation-triangle"}),n().createElement("span",null,a)),n().createElement("form",{onSubmit:t=>{t.preventDefault(),s.trim()&&e({dsn:"(DESCRIPTION =\n  (ADDRESS_LIST =\n    (ADDRESS =\n      (PROTOCOL = TCP)\n      (HOST = 10.247.0.236)\n      (PORT = 1521)\n    )\n  )\n  (CONNECT_DATA =\n    (SERVICE_NAME = po40)\n  )\n)",username:s,password:d})},className:o.form},n().createElement(l.Field,{label:"Usuário",description:"Usuário de acesso ao SIP"},n().createElement(l.Input,{value:s,onChange:e=>i(e.currentTarget.value),placeholder:"usuario",required:!0,autoComplete:"off"})),n().createElement(l.Field,{label:"Senha",description:"A senha não será salva e não persistirá no painel"},n().createElement(l.SecretInput,{value:d,onChange:e=>m(e.currentTarget.value),placeholder:"senha",required:!0,autoComplete:"new-password",isConfigured:!1,onReset:()=>m("")})),n().createElement("div",{className:o.actions},n().createElement(l.Button,{type:"submit",variant:"primary",disabled:t||!s||!d},t?"Conectando...":"Conectar ao SIP"))))}const c=e=>({container:o.css`
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
  `});function i(e,t,a){return t in e?Object.defineProperty(e,t,{value:a,enumerable:!0,configurable:!0,writable:!0}):e[t]=a,e}function d(e){for(var t=1;t<arguments.length;t++){var a=null!=arguments[t]?arguments[t]:{},r=Object.keys(a);"function"==typeof Object.getOwnPropertySymbols&&(r=r.concat(Object.getOwnPropertySymbols(a).filter(function(e){return Object.getOwnPropertyDescriptor(a,e).enumerable}))),r.forEach(function(t){i(e,t,a[t])})}return e}function m(e,t){return t=null!=t?t:{},Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(t)):function(e,t){var a=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);t&&(r=r.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),a.push.apply(a,r)}return a}(Object(t)).forEach(function(a){Object.defineProperty(e,a,Object.getOwnPropertyDescriptor(t,a))}),e}function u({isOpen:e,params:t,onConfirm:a,onDismiss:o}){const s=(0,l.useStyles2)(p),[c,i]=(0,r.useState)({});(0,r.useEffect)(()=>{e&&i(e=>{const a=d({},e);for(const e of t)void 0===a[e]&&(a[e]="");return a})},[e,t]);return e?n().createElement(l.Modal,{title:"Variáveis de Bind Encontradas",isOpen:e,onDismiss:o,onClickBackdrop:o,className:s.modal},n().createElement("div",{className:s.container},n().createElement("p",{className:s.description},"Preencha os valores para as variáveis identificadas no seu script SQL:"),n().createElement("div",{className:s.fields},t.map(e=>n().createElement(l.Field,{label:`:${e}`,key:e},n().createElement(l.Input,{value:c[e]||"",onChange:t=>((e,t)=>{i(a=>m(d({},a),{[e]:t}))})(e,t.currentTarget.value),placeholder:`Valor para ${e}...`,autoFocus:t[0]===e})))),n().createElement(l.Modal.ButtonRow,null,n().createElement(l.Button,{variant:"secondary",onClick:o,fill:"outline"},"Cancelar"),n().createElement(l.Button,{variant:"primary",onClick:()=>{a(c)}},"Executar Query")))):null}const p=e=>({modal:o.css`
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
  `});function b(e,t,a,r,n,o,l){try{var s=e[o](l),c=s.value}catch(e){return void a(e)}s.done?t(c):Promise.resolve(c).then(r,n)}function f(e){return function(){var t=this,a=arguments;return new Promise(function(r,n){var o=e.apply(t,a);function l(e){b(o,r,n,l,s,"next",e)}function s(e){b(o,r,n,l,s,"throw",e)}l(void 0)})}}const g=[{id:"table",label:"Tabela",renderIcon:()=>n().createElement("svg",{width:"26",height:"26",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round"},n().createElement("rect",{x:"3",y:"3",width:"18",height:"18",rx:"2"}),n().createElement("line",{x1:"3",y1:"9",x2:"21",y2:"9"}),n().createElement("line",{x1:"3",y1:"15",x2:"21",y2:"15"}),n().createElement("line",{x1:"9",y1:"3",x2:"9",y2:"21"}),n().createElement("line",{x1:"15",y1:"3",x2:"15",y2:"21"}))},{id:"xy",label:"Gráfico XY",renderIcon:()=>n().createElement("svg",{width:"26",height:"26",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round"},n().createElement("path",{d:"M3 3v18h18"}),n().createElement("polyline",{points:"5 15 10 9 14 13 19 6"}),n().createElement("circle",{cx:"5",cy:"15",r:"1.5",fill:"currentColor"}),n().createElement("circle",{cx:"10",cy:"9",r:"1.5",fill:"currentColor"}),n().createElement("circle",{cx:"14",cy:"13",r:"1.5",fill:"currentColor"}),n().createElement("circle",{cx:"19",cy:"6",r:"1.5",fill:"currentColor"}))},{id:"timeseries",label:"Série temporal",renderIcon:()=>n().createElement("svg",{width:"26",height:"26",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round"},n().createElement("polyline",{points:"3 13 7 8 11 11 15 6 18 8"}),n().createElement("circle",{cx:"16",cy:"16",r:"4.5"}),n().createElement("polyline",{points:"16 13.5 16 16 18 16"}))},{id:"bar",label:"Gráfico de barras",renderIcon:()=>n().createElement("svg",{width:"26",height:"26",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round"},n().createElement("line",{x1:"3",y1:"20",x2:"21",y2:"20"}),n().createElement("rect",{x:"5",y:"11",width:"3",height:"9",rx:"0.5"}),n().createElement("rect",{x:"9.5",y:"5",width:"3",height:"15",rx:"0.5"}),n().createElement("rect",{x:"14",y:"8",width:"3",height:"12",rx:"0.5"}),n().createElement("rect",{x:"18.5",y:"13",width:"2",height:"7",rx:"0.5"}))},{id:"gauge",label:"Gauge",renderIcon:()=>n().createElement("svg",{width:"26",height:"26",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round"},n().createElement("circle",{cx:"12",cy:"12",r:"9",strokeDasharray:"2.5 2.5"}),n().createElement("line",{x1:"12",y1:"12",x2:"16.5",y2:"7.5"}),n().createElement("circle",{cx:"12",cy:"12",r:"2",fill:"currentColor"}))},{id:"scatter",label:"Dispersão",renderIcon:()=>n().createElement("svg",{width:"26",height:"26",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round"},n().createElement("path",{d:"M3 3v18h18"}),n().createElement("circle",{cx:"7",cy:"14",r:"1.5",fill:"currentColor"}),n().createElement("circle",{cx:"10",cy:"8",r:"1.5",fill:"currentColor"}),n().createElement("circle",{cx:"12",cy:"15",r:"1.5",fill:"currentColor"}),n().createElement("circle",{cx:"14",cy:"10",r:"1.5",fill:"currentColor"}),n().createElement("circle",{cx:"16",cy:"6",r:"1.5",fill:"currentColor"}),n().createElement("circle",{cx:"18",cy:"13",r:"1.5",fill:"currentColor"}))}],x=["#22c55e","#eab308","#ef4444","#3b82f6","#b4167e","#8b5cf6","#06b6d4","#f97316","#10b981","#f43f5e","#64748b","#ffffff"];function v({onExecute:e,onDisconnect:t,isExecuting:a,error:s,lastResult:c,sqlToLoad:i,onConfigChange:d,onApplyToDashboard:m,initialConfig:p}){var b,v,y;const E=(0,l.useStyles2)(h),[w,N]=(0,r.useState)(void 0!==i?i:""),C=e=>{N(e)},[k,S]=(0,r.useState)(200),[L,O]=(0,r.useState)(!1),[R,P]=(0,r.useState)([]),[I,A]=(0,r.useState)(null!==(b=null==p?void 0:p.viewMode)&&void 0!==b?b:"table"),[j,D]=(0,r.useState)(!1),T=(null==c||null===(v=c.rows)||void 0===v?void 0:v[0])?Object.keys(c.rows[0]):["DTH_INIC_PROCE","VALOR","COD_EQPMT_PRODC","TS","COD_IDENT_UNMET"],[B,_]=(0,r.useState)((null==p?void 0:p.xAxis)||T[0]||"DTH_INIC_PROCE"),[z,$]=(0,r.useState)((null==p||null===(y=p.yAxes)||void 0===y?void 0:y[0])||T[1]||"VALOR"),[F,M]=(0,r.useState)("Todas"),[V,q]=(0,r.useState)(T[0]||"DTH_INIC_PROCE"),[H,W]=(0,r.useState)("Crescente"),[G,K]=(0,r.useState)("25"),[Y,U]=(0,r.useState)(!0),[X,Q]=(0,r.useState)(!0),[J,Z]=(0,r.useState)("100"),[ee,te]=(0,r.useState)("Linear"),[ae,re]=(0,r.useState)(!0),[ne,oe]=(0,r.useState)(!0),[le,se]=(0,r.useState)(T[0]||"DTH_INIC_PROCE"),[ce,ie]=(0,r.useState)(T[1]||"VALOR"),[de,me]=(0,r.useState)("Automático"),[ue,pe]=(0,r.useState)(!1),[be,fe]=(0,r.useState)(!0),[ge,xe]=(0,r.useState)(T[0]||"DTH_INIC_PROCE"),[ve,he]=(0,r.useState)(T[1]||"VALOR"),[ye,Ee]=(0,r.useState)("100"),[we,Ne]=(0,r.useState)("Nenhum"),[Ce,ke]=(0,r.useState)("Vertical"),[Se,Le]=(0,r.useState)(!0),[Oe,Re]=(0,r.useState)(!1),[Pe,Ie]=(0,r.useState)("#b4167e"),[Ae,je]=(0,r.useState)(!1),[De,Te]=(0,r.useState)(T[1]||"VALOR"),[Be,_e]=(0,r.useState)(0),[ze,$e]=(0,r.useState)(100),[Fe,Me]=(0,r.useState)("%"),[Ve,qe]=(0,r.useState)(!0),[He,We]=(0,r.useState)("1"),[Ge,Ke]=(0,r.useState)("#22c55e"),[Ye,Ue]=(0,r.useState)("#eab308"),[Xe,Qe]=(0,r.useState)("#ef4444"),[Je,Ze]=(0,r.useState)(null),[et,tt]=(0,r.useState)(!0),[at,rt]=(0,r.useState)(T[0]||"DTH_INIC_PROCE"),[nt,ot]=(0,r.useState)(T[1]||"VALOR"),[lt,st]=(0,r.useState)("100"),[ct,it]=(0,r.useState)("5"),[dt,mt]=(0,r.useState)("Nenhum"),[ut,pt]=(0,r.useState)("Nenhum"),[bt,ft]=(0,r.useState)(!1),[gt,xt]=(0,r.useState)(!0);(0,r.useEffect)(()=>{void 0!==i&&N(i)},[i]),(0,r.useEffect)(()=>{if((null==c?void 0:c.rows)&&c.rows.length>0){const e=Object.keys(c.rows[0]);if(e.length>0){const t=e.find(e=>{const t=e.toLowerCase();return"ts"===t||"time"===t||"data"===t||t.includes("date")||t.includes("dth")||t.includes("hora")||t.includes("tempo")})||e[0],a=e.find(e=>{const t=e.toLowerCase();return"pi_value"===t||"valor"===t||"val"===t||"value"===t||"y"===t||t.includes("medida")||t.includes("total")||t.includes("qtde")})||e.find(e=>e!==t&&"number"==typeof c.rows[0][e])||(e.length>1?e[1]:e[0]);_(t),$(a),q(t),se(t),ie(a),xe(t),he(a),Te(a),rt(t),ot(a)}}},[c]);const vt=()=>{let e=B,t=[z];return"bar"===I?(e=ge,t=[ve]):"timeseries"===I?(e=le,t=[ce]):"gauge"===I?(e=T[0],t=[De]):"scatter"===I&&(e=at,t=[nt]),{viewMode:I,xAxis:e,yAxes:t,tableVisibleCols:F,tableSortBy:V,tableOrder:H,tableRowsPerPage:Number(G)||25,tableColumnFilters:Y,tableAdjustWidth:X,xyRowsPerPage:Number(J)||100,paginationSize:"xy"===I?Number(J)||100:Number(G)||25,xyLineType:ee,xyShowPoints:ae,xyLegend:ne,timeDateField:le,timeValueField:ce,timeInterval:de,timeFillGaps:ue,timeLegend:be,barXAxis:ge,barYAxis:ve,barRowsPerPage:Number(ye)||100,barGroupBy:we,barOrientation:Ce,barLegend:Se,barShowValues:Oe,barColor:Pe,gaugeNumericField:De,gaugeMin:Be,gaugeMax:ze,gaugeUnit:Fe,gaugeShowValue:Ve,gaugeDecimals:Number(He)||1,gaugeColor1:Ge,gaugeColor2:Ye,gaugeColor3:Xe,gaugeLegend:et,scatterXAxis:at,scatterYAxis:nt,scatterRowsPerPage:Number(lt)||100,scatterPointSize:Number(ct)||5,scatterColorBy:dt,scatterGroupBy:ut,scatterTrendLine:bt,scatterLegend:gt}};(0,r.useEffect)(()=>{null==d||d(vt())},[I,B,z,F,V,H,G,Y,X,ee,ae,ne,J,le,ce,de,ue,be,ge,ve,ye,we,Ce,Se,Oe,Pe,De,Be,ze,Fe,Ve,He,Ge,Ye,Xe,et,at,nt,lt,ct,dt,ut,bt,gt]);const ht=()=>f(function*(){if(!w.trim()||a)return;const t=Array.from(w.matchAll(/(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g)),r=Array.from(new Set(t.map(e=>e[1])));r.length>0?(P(r),O(!0)):yield e(w,k)})(),yt=(e,t)=>n().createElement("button",{type:"button",className:(0,o.cx)(E.switchTrack,e&&E.switchTrackActive),onClick:()=>t(!e),"aria-checked":e,role:"switch"},n().createElement("span",{className:(0,o.cx)(E.switchKnob,e&&E.switchKnobActive)})),Et=(e,t,a)=>n().createElement("div",{className:E.segmentedContainer},e.map(e=>n().createElement("button",{key:e,type:"button",className:(0,o.cx)(E.segmentedBtn,t===e&&E.segmentedBtnActive),onClick:()=>a(e)},e))),wt=(e,t,a)=>n().createElement("div",{className:E.selectWrapper},n().createElement("select",{className:E.nativeSelect,value:e,onChange:e=>t(e.target.value)},a.map(e=>n().createElement("option",{key:e,value:e},e))),n().createElement("span",{className:E.selectChevron},n().createElement(l.Icon,{name:"angle-down"})));return n().createElement("div",{className:E.container},n().createElement("div",{className:E.toolbar},n().createElement("div",{className:E.toolbarLeft},n().createElement(l.Icon,{name:"database",className:E.dbIcon}),n().createElement("span",{className:E.statusDot}),n().createElement("span",{className:E.connectionStatus},"Conectado ao SIP")),n().createElement("button",{type:"button",className:E.disconnectButton,onClick:t,title:"Desconectar"},n().createElement(l.Icon,{name:"signout"}),n().createElement("span",null,"Desconectar"))),n().createElement("div",{className:E.editorArea},n().createElement("textarea",{className:E.textarea,value:w,onChange:e=>C(e.target.value),onKeyDown:e=>{"Enter"===e.key&&e.ctrlKey&&(e.preventDefault(),ht())},placeholder:"Digite sua consulta SQL aqui (SELECT / WITH; final opcional)...\nPressione Ctrl+Enter para executar.",spellCheck:!1,disabled:a}),n().createElement("div",{className:E.editorControls},n().createElement("div",{className:E.limitControl},n().createElement("span",{className:E.limitLabel},"Limite de linhas"),n().createElement(l.Input,{type:"number",min:1,max:5e3,value:k,onChange:e=>S(parseInt(e.currentTarget.value,10)||200),className:E.limitInput,disabled:a})),n().createElement("div",{className:E.actionButtons},n().createElement("button",{type:"button",className:E.clearButton,onClick:()=>C(""),disabled:a||!w},"Limpar"),n().createElement("button",{type:"button",className:E.runButton,onClick:ht,disabled:a||!w.trim()},n().createElement(l.Icon,{name:"play"}),n().createElement("span",null,a?"Executando...":"Executar (Ctrl+Enter)")))),s&&n().createElement("div",{className:E.errorAlert},n().createElement(l.Icon,{name:"exclamation-triangle"}),n().createElement("span",null,s)),n().createElement("div",{className:E.visualGrid},g.map(e=>{const t=I===e.id;return n().createElement("button",{key:e.id,type:"button",className:(0,o.cx)(E.visualCard,t&&E.visualCardActive),onClick:()=>A(e.id)},n().createElement("div",{className:E.visualCardIcon},e.renderIcon()),n().createElement("span",{className:E.visualCardLabel},e.label))})),n().createElement("div",{className:E.configContainer},n().createElement("div",{className:E.configHeader,onClick:()=>D(!j)},n().createElement("span",null,"Configurações do gráfico"),n().createElement(l.Icon,{name:j?"angle-down":"angle-up"})),!j&&n().createElement("div",{className:E.configBody},"table"===I&&n().createElement(n().Fragment,null,n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Colunas visíveis"),wt(F,M,["Todas",...T])),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Ordenar por"),wt(V,q,T)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Ordem"),Et(["Crescente","Decrescente"],H,W)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Linhas por página"),wt(G,K,["10","25","50","100"])),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Filtros por coluna"),yt(Y,U)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Ajustar largura"),yt(X,Q))),"xy"===I&&n().createElement(n().Fragment,null,n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Eixo X"),wt(B,_,T)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Eixo Y"),wt(z,$,T)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Linhas por página"),wt(J,Z,["10","25","50","100","200","500"])),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Tipo de linha"),wt(ee,te,["Linear","Suave","Degrau"])),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Mostrar pontos"),yt(ae,re)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Legenda"),yt(ne,oe))),"timeseries"===I&&n().createElement(n().Fragment,null,n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Campo de data"),wt(le,se,T)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Campo de valor"),wt(ce,ie,T)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Intervalo"),wt(de,me,["Automático","1m","5m","15m","1h","1d"])),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Preencher lacunas"),yt(ue,pe)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Legenda"),yt(be,fe))),"bar"===I&&n().createElement(n().Fragment,null,n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Eixo X"),wt(ge,xe,T)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Eixo Y"),wt(ve,he,T)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Linhas por página"),wt(ye,Ee,["10","25","50","100","200","500"])),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Agrupamento"),wt(we,Ne,["Nenhum",...T])),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Orientação"),Et(["Vertical","Horizontal"],Ce,ke)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Legenda"),yt(Se,Le)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Mostrar valores"),yt(Oe,Re)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Cor das barras"),n().createElement("div",{style:{position:"relative"}},n().createElement("button",{type:"button",className:E.colorPickerBtn,onClick:()=>je(!Ae)},n().createElement("span",{className:E.colorPreview,style:{backgroundColor:Pe}}),n().createElement(l.Icon,{name:"angle-down"})),Ae&&n().createElement("div",{className:E.colorDropdown},x.map(e=>n().createElement("button",{key:e,type:"button",className:E.colorSwatch,style:{backgroundColor:e},onClick:()=>{Ie(e),je(!1)}})))))),"gauge"===I&&n().createElement(n().Fragment,null,n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Campo numérico"),wt(De,Te,T)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Valor mínimo"),n().createElement("input",{type:"number",className:E.numberInput,value:Be,onChange:e=>_e(Number(e.target.value))})),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Valor máximo"),n().createElement("input",{type:"number",className:E.numberInput,value:ze,onChange:e=>$e(Number(e.target.value))})),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Unidade"),wt(Fe,Me,["%","°C","bar","kg/h","rpm","m³/h","V","A","kW"])),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Faixas"),n().createElement("div",{style:{position:"relative"}},n().createElement("div",{className:E.thresholdsRow},n().createElement("button",{type:"button",className:E.thresholdBoxBtn,style:{backgroundColor:Ge},title:"Faixa Normal (clique para trocar a cor)",onClick:()=>Ze(1===Je?null:1)}),n().createElement("button",{type:"button",className:E.thresholdBoxBtn,style:{backgroundColor:Ye},title:"Faixa Alerta (clique para trocar a cor)",onClick:()=>Ze(2===Je?null:2)}),n().createElement("button",{type:"button",className:E.thresholdBoxBtn,style:{backgroundColor:Xe},title:"Faixa Crítica (clique para trocar a cor)",onClick:()=>Ze(3===Je?null:3)})),null!==Je&&n().createElement("div",{className:E.colorDropdown},x.map(e=>n().createElement("button",{key:e,type:"button",className:E.colorSwatch,style:{backgroundColor:e},onClick:()=>{1===Je?Ke(e):2===Je?Ue(e):3===Je&&Qe(e),Ze(null)}}))))),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Legenda"),yt(et,tt)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Mostrar valor"),yt(Ve,qe)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Casas decimais"),wt(He,We,["0","1","2","3"]))),"scatter"===I&&n().createElement(n().Fragment,null,n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Eixo X"),wt(at,rt,T)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Eixo Y"),wt(nt,ot,T)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Linhas por página"),wt(lt,st,["10","25","50","100","200","500"])),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Tamanho do ponto"),wt(ct,it,["3","5","8","10","12"])),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Cor por"),wt(dt,mt,["Nenhum",...T])),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Agrupar por"),wt(ut,pt,["Nenhum",...T])),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Linha de tendência"),yt(bt,ft)),n().createElement("div",{className:E.formRow},n().createElement("span",{className:E.fieldLabel},"Legenda"),yt(gt,xt))))),n().createElement("button",{type:"button",className:E.applyButton,onClick:()=>f(function*(){!c&&w.trim()&&(yield ht()),null==m||m(vt())})(),disabled:Boolean(a)},n().createElement(l.Icon,{name:"play"}),n().createElement("span",null,"Aplicar visualização"))),n().createElement(u,{isOpen:L,params:R,onConfirm:t=>f(function*(){O(!1),yield e(w,k,t)})(),onDismiss:()=>O(!1)}))}const h=e=>({container:o.css`
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
  `});var y=a(5341);function E(e,t,a,r,n,o,l){try{var s=e[o](l),c=s.value}catch(e){return void a(e)}s.done?t(c):Promise.resolve(c).then(r,n)}function w(e){return function(){var t=this,a=arguments;return new Promise(function(r,n){var o=e.apply(t,a);function l(e){E(o,r,n,l,s,"next",e)}function s(e){E(o,r,n,l,s,"throw",e)}l(void 0)})}}function N(e,t,a){return t in e?Object.defineProperty(e,t,{value:a,enumerable:!0,configurable:!0,writable:!0}):e[t]=a,e}function C(e,t){return t=null!=t?t:{},Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(t)):function(e,t){var a=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);t&&(r=r.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),a.push.apply(a,r)}return a}(Object(t)).forEach(function(a){Object.defineProperty(e,a,Object.getOwnPropertyDescriptor(t,a))}),e}function k({onResultChange:e,onApplyToDashboard:t,onConfigChange:a,sqlToLoad:o,initialConfig:c}){const i=(0,l.useStyles2)(S),[d,m]=(0,r.useState)(null),[u,p]=(0,r.useState)(!1),[b,f]=(0,r.useState)(),[g,x]=(0,r.useState)(!1),[h,E]=(0,r.useState)(),[k,L]=(0,r.useState)(null),[O,R]=(0,r.useState)(c);(0,r.useEffect)(()=>()=>{d&&(0,y.nM)(d)},[d]);return n().createElement("div",{className:i.container},d?n().createElement(v,{onExecute:(t,a,r)=>w(function*(){if(!d)return null;x(!0),E(void 0);try{var n,o;const l=yield(0,y.Kq)({session_id:d,sql:t,max_rows:a,params:r});L(l);let s=null==O?void 0:O.xAxis,c=null==O||null===(o=O.yAxes)||void 0===o?void 0:o[0];if(l.rows&&l.rows.length>0){const e=Object.keys(l.rows[0]);if(e.length>0){const t=e.find(e=>{const t=e.toLowerCase();return"ts"===t||"time"===t||"data"===t||t.includes("date")||t.includes("dth")||t.includes("hora")||t.includes("tempo")})||e[0],a=e.find(e=>{const t=e.toLowerCase();return"pi_value"===t||"valor"===t||"val"===t||"value"===t||"y"===t||t.includes("medida")||t.includes("total")||t.includes("qtde")})||e.find(e=>e!==t&&"number"==typeof l.rows[0][e])||(e.length>1?e[1]:e[0]);s=s&&e.includes(s)?s:t,c=c&&e.includes(c)?c:a}}const i=C(function(e){for(var t=1;t<arguments.length;t++){var a=null!=arguments[t]?arguments[t]:{},r=Object.keys(a);"function"==typeof Object.getOwnPropertySymbols&&(r=r.concat(Object.getOwnPropertySymbols(a).filter(function(e){return Object.getOwnPropertyDescriptor(a,e).enumerable}))),r.forEach(function(t){N(e,t,a[t])})}return e}({viewMode:null!==(n=null==O?void 0:O.viewMode)&&void 0!==n?n:"xy"},O||{}),{xAxis:s,yAxes:c?[c]:[]});return null==e||e(l,t,i),l}catch(e){return E(e.message||"Falha ao executar consulta"),null}finally{x(!1)}})(),onDisconnect:()=>w(function*(){d&&(yield(0,y.nM)(d)),m(null),E(void 0)})(),onConfigChange:e=>{R(e),null==a||a(e)},onApplyToDashboard:t,isExecuting:g,error:h,lastResult:k,showResult:!0,sqlToLoad:o,initialConfig:c}):n().createElement(s,{onConnect:e=>w(function*(){p(!0),f(void 0);try{const t=yield(0,y.bF)(e);m(t.session_id)}catch(e){f(e.message||"Falha ao conectar ao banco de dados")}finally{p(!1)}})(),isConnecting:u,error:b}))}const S=e=>({container:o.css`
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    color: var(--text-primary);
    background-color: var(--surface-primary);
  `})},5341(e,t,a){function r(e,t,a,r,n,o,l){try{var s=e[o](l),c=s.value}catch(e){return void a(e)}s.done?t(c):Promise.resolve(c).then(r,n)}function n(e){return function(){var t=this,a=arguments;return new Promise(function(n,o){var l=e.apply(t,a);function s(e){r(l,n,o,s,c,"next",e)}function c(e){r(l,n,o,s,c,"throw",e)}s(void 0)})}}a.d(t,{Kq:()=>i,bF:()=>s,nM:()=>c});const o="undefined"!=typeof window&&(null===(l=window.location)||void 0===l?void 0:l.hostname)?`${window.location.protocol}//${window.location.hostname}:8085`:"http://localhost:8085";var l;function s(e){return n(function*(){const t=yield fetch(`${o}/connect`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dsn:e.dsn,username:e.username,password:e.password||""})});if(!t.ok){const e=yield t.json().catch(()=>null);throw new Error((null==e?void 0:e.detail)||`Erro na conexão: ${t.status} ${t.statusText}`)}return t.json()})()}function c(e){return n(function*(){yield fetch(`${o}/disconnect?session_id=${encodeURIComponent(e)}`,{method:"POST"}).catch(()=>{})})()}function i(e){return n(function*(){const t=yield fetch(`${o}/query`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)});if(!t.ok){const e=yield t.json().catch(()=>null);throw new Error((null==e?void 0:e.detail)||`Erro na consulta: ${t.status} ${t.statusText}`)}return t.json()})()}}}]);
//# sourceMappingURL=5.25906347.js.map