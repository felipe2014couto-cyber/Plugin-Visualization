import React from 'react';
import { Select, Field, MultiSelect, useStyles2 } from '@grafana/ui';
import { SelectableValue, GrafanaTheme2 } from '@grafana/data';
import { css } from '@emotion/css';

export interface SqlChartSettingsProps {
  columns: string[];
  xAxis: string | undefined;
  yAxes: string[];
  onXAxisChange: (col: string | undefined) => void;
  onYAxesChange: (cols: string[]) => void;
}

export function SqlChartSettings({
  columns,
  xAxis,
  yAxes,
  onXAxisChange,
  onYAxesChange,
}: SqlChartSettingsProps) {
  const styles = useStyles2(getStyles);

  const columnOptions: Array<SelectableValue<string>> = columns.map((col) => ({
    label: col,
    value: col,
  }));

  const xAxisOption = xAxis ? columnOptions.find((o) => o.value === xAxis) : null;
  
  return (
    <div className={styles.container}>
      <Field label="Eixo X (Tempo/Categoria)" description="Coluna que representa o eixo X.">
        <Select
          options={columnOptions}
          value={xAxisOption}
          onChange={(v) => onXAxisChange(v.value)}
          placeholder="Selecione o Eixo X..."
          isClearable
          width={40}
        />
      </Field>

      <Field label="Eixos Y (Valores)" description="Colunas métricas para exibir no gráfico.">
        <MultiSelect
          options={columnOptions}
          value={yAxes}
          onChange={(vals) => onYAxesChange(vals.map((v) => v.value!))}
          placeholder="Selecione as séries..."
          width={40}
        />
      </Field>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(2)};
    padding: ${theme.spacing(2)} 0;
    border-bottom: 1px solid var(--border-color);

    /* Forçar a cor dos labels e descrições para melhorar leitura no modo escuro */
    label {
      color: ${theme.colors.text.primary} !important;
      font-weight: ${theme.typography.fontWeightMedium};
    }
    div[class*="-description"] {
      color: ${theme.colors.text.secondary} !important;
    }

    /* Tentar forçar o Select a não ficar branco caso algum estilo global esteja vazando */
    div[class*="-input-wrapper"], div[class*="-control"] {
      background-color: ${theme.colors.background.secondary} !important;
      border-color: ${theme.colors.border.weak} !important;
      color: ${theme.colors.text.primary} !important;
    }
    
    div[class*="-singleValue"] {
      color: ${theme.colors.text.primary} !important;
    }
    
    div[class*="-multiValue"] {
      background-color: ${theme.colors.background.primary} !important;
      border: 1px solid ${theme.colors.border.strong} !important;
      color: ${theme.colors.text.primary} !important;
    }
  `,
});
