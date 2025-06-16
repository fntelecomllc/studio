import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PageHeader from '../PageHeader';
import { Home } from 'lucide-react';

describe('PageHeader', () => {
  it('renders the title', () => {
    render(<PageHeader title="Test Title" />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<PageHeader title="Test Title" description="Test Description" />);
    expect(screen.getByText('Test Description')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    render(<PageHeader title="Test Title" />);
    expect(screen.queryByText('Test Description')).not.toBeInTheDocument();
  });

  it('renders the icon when provided', () => {
    render(<PageHeader title="Test Title" icon={Home} />);
    // Check if an SVG is rendered (Lucide icons are SVGs)
    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders action buttons when provided', () => {
    const ActionButton = () => <button>Click Me</button>;
    render(<PageHeader title="Test Title" actionButtons={<ActionButton />} />);
    expect(screen.getByText('Click Me')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(
      <PageHeader 
        title="Snapshot Title" 
        description="Snapshot Description" 
        icon={Home}
        actionButtons={<button>Action</button>}
      />
    );
    expect(container).toMatchSnapshot();
  });
});
