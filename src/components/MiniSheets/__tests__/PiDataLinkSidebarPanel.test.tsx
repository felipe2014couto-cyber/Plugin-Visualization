import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PiDataLinkSidebarPanel } from '../PiDataLinkSidebarPanel';

describe('PiDataLinkSidebarPanel Component', () => {
  test('renders all 7 PI DataLink options and groups', () => {
    const handleOpen = jest.fn();
    render(<PiDataLinkSidebarPanel onOpenFunction={handleOpen} />);

    expect(screen.getByText('VALOR ÚNICO')).toBeInTheDocument();
    expect(screen.getByText('VALOR MÚLTIPLO')).toBeInTheDocument();
    expect(screen.getByText('CÁLCULO')).toBeInTheDocument();

    expect(screen.getByTestId('datalink-sidebar-btn-PICurrVal')).toBeInTheDocument();
    expect(screen.getByTestId('datalink-sidebar-btn-PIArcVal')).toBeInTheDocument();
    expect(screen.getByTestId('datalink-sidebar-btn-PICompDat')).toBeInTheDocument();
    expect(screen.getByTestId('datalink-sidebar-btn-PISampDat')).toBeInTheDocument();
    expect(screen.getByTestId('datalink-sidebar-btn-PITimeDat')).toBeInTheDocument();
    expect(screen.getByTestId('datalink-sidebar-btn-PIAdvCalcVal')).toBeInTheDocument();
    expect(screen.getByTestId('datalink-sidebar-btn-PITimeFilter')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('datalink-sidebar-btn-PICurrVal'));
    expect(handleOpen).toHaveBeenCalledWith('PICurrVal');

    fireEvent.click(screen.getByTestId('datalink-sidebar-btn-PIAdvCalcVal'));
    expect(handleOpen).toHaveBeenCalledWith('PIAdvCalcVal');
  });
});
