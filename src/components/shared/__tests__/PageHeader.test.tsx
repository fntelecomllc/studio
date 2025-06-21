import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import PageHeader from '../PageHeader';
import { Home } from 'lucide-react';

describe('PageHeader', () => {
  it('renders the title', () => {
    render(<PageHeader title="Test Title" />);
    expect(render(<PageHeader title="Test Title" />).getByText('Test Title')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    const { getByText } = render(<PageHeader title="Test Title" description="Test Description" />);
    expect(getByText('Test Description')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    const { queryByText } = render(<PageHeader title="Test Title" />);
    expect(queryByText('Test Description')).not.toBeInTheDocument();
  });

  it('renders the icon when provided', () => {
    render(<PageHeader title="Test Title" icon={Home} />);
    // Check if an SVG is rendered (Lucide icons are SVGs)
    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders action buttons when provided', () => {
    const ActionButton = () => <button>Click Me</button>;
    const { getByText } = render(<PageHeader title="Test Title" actionButtons={<ActionButton />} />);
    expect(getByText('Click Me')).toBeInTheDocument();
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
