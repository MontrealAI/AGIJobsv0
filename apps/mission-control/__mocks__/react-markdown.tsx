import React from 'react';

type Props = {
  children?: React.ReactNode;
};

export default function ReactMarkdown({ children }: Props) {
  return <div data-testid="markdown-preview">{children}</div>;
}
