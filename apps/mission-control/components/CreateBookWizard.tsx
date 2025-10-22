'use client';

import { useState } from 'react';
import { Box, Button, Flex, FormControl, FormLabel, Input, Stack, Tag, Textarea, Tooltip } from '@chakra-ui/react';
import { useMutation } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';

import { OrchestratorMessage, sendOrchestratorPrompt, uploadToIpfs } from '../lib/orchestrator';

const steps = [
  { key: 'synopsis', label: 'Synopsis', placeholder: 'Describe the artifact impact in 2-3 sentences.' },
  { key: 'outline', label: 'Outline', placeholder: 'List the major sections and objectives.' },
  { key: 'manuscript', label: 'Manuscript', placeholder: 'Draft the long-form content in Markdown.' }
] as const;

type StepKey = (typeof steps)[number]['key'];

export function CreateBookWizard() {
  const [messages, setMessages] = useState<OrchestratorMessage[]>([]);
  const [draft, setDraft] = useState<Record<StepKey, string>>({ synopsis: '', outline: '', manuscript: '' });
  const [activeStep, setActiveStep] = useState<StepKey>('synopsis');
  const [artifactTitle, setArtifactTitle] = useState('');
  const [cid, setCid] = useState<string | null>(null);

  const chatMutation = useMutation({
    mutationFn: ({ prompt, context }: { prompt: string; context: StepKey }) => sendOrchestratorPrompt(prompt, context),
    onSuccess: (message) => {
      setMessages((current) => [...current, message]);
    },
    onError: (err) => {
      toast.error((err as Error).message);
    }
  });

  const ipfsMutation = useMutation({
    mutationFn: async () => {
      const compiled = `# ${artifactTitle}\n\n## Synopsis\n${draft.synopsis}\n\n## Outline\n${draft.outline}\n\n## Manuscript\n${draft.manuscript}`;
      return uploadToIpfs({ name: `${artifactTitle || 'artifact'}.md`, content: compiled });
    },
    onSuccess: (result) => {
      setCid(result.cid);
      toast.success('Artifact uploaded to IPFS');
    },
    onError: (err) => toast.error((err as Error).message)
  });

  const currentIndex = steps.findIndex((step) => step.key === activeStep);
  const isLastStep = currentIndex === steps.length - 1;

  const handleSubmitPrompt = async () => {
    const prompt = draft[activeStep];
    if (!prompt.trim()) {
      toast.error('Please add content before requesting feedback.');
      return;
    }
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}`, role: 'user', content: prompt, timestamp: new Date().toISOString() }
    ]);
    chatMutation.mutate({ prompt, context: activeStep });
  };

  const goToNextStep = () => {
    if (isLastStep) {
      toast.success('Draft complete — ready for IPFS upload');
      return;
    }
    setActiveStep(steps[currentIndex + 1]?.key ?? activeStep);
  };

  return (
    <Stack spacing={6}>
      <Flex gap={4} wrap="wrap">
        {steps.map((step) => (
          <Tag key={step.key} size="lg" colorScheme={step.key === activeStep ? 'purple' : 'gray'}>
            {step.label}
          </Tag>
        ))}
      </Flex>

      <FormControl>
        <FormLabel>Artifact Title</FormLabel>
        <Input value={artifactTitle} onChange={(event) => setArtifactTitle(event.target.value)} placeholder="Validator Resilience Primer" />
      </FormControl>

      <FormControl>
        <FormLabel>{steps[currentIndex]?.label} Draft</FormLabel>
        <Textarea
          rows={steps[currentIndex]?.key === 'manuscript' ? 12 : 6}
          value={draft[activeStep]}
          onChange={(event) => setDraft({ ...draft, [activeStep]: event.target.value })}
          placeholder={steps[currentIndex]?.placeholder}
        />
      </FormControl>

      <Flex gap={3}>
        <Button colorScheme="purple" onClick={handleSubmitPrompt} isLoading={chatMutation.isPending}>
          Request orchestrator feedback
        </Button>
        <Button variant="outline" onClick={goToNextStep}>
          {isLastStep ? 'Mark draft ready' : 'Next step'}
        </Button>
      </Flex>

      <Box className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Box className="rounded-lg border border-slate-700/60 bg-slate-900/80 p-4">
          <h3 className="mb-3 text-lg font-semibold text-indigo-200">Chat Transcript</h3>
          <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
            {messages.map((message) => (
              <Box
                key={message.id}
                className={`rounded-lg border p-3 text-sm ${
                  message.role === 'assistant'
                    ? 'border-indigo-500/40 bg-indigo-950/60 text-indigo-100'
                    : 'border-slate-600/60 bg-slate-800/70'
                }`}
              >
                <p className="text-xs uppercase tracking-wide text-slate-400">{message.role}</p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">{message.content}</p>
              </Box>
            ))}
            {messages.length === 0 && <p className="text-sm text-slate-500">No orchestrator feedback yet.</p>}
          </div>
        </Box>
        <Box className="rounded-lg border border-slate-700/60 bg-slate-900/80 p-4">
          <h3 className="mb-3 text-lg font-semibold text-indigo-200">Markdown Preview</h3>
          <div className="prose prose-invert max-w-none">
            <ReactMarkdown>{draft.manuscript || draft.outline || draft.synopsis || '_Start drafting to see preview_'}</ReactMarkdown>
          </div>
        </Box>
      </Box>

      <Tooltip
        hasArrow
        label="Uploads the composed Markdown bundle and returns a CID ready for mint confirmation."
      >
        <Button colorScheme="green" size="lg" alignSelf="flex-start" onClick={() => ipfsMutation.mutate()} isLoading={ipfsMutation.isPending}>
          Upload to IPFS
        </Button>
      </Tooltip>

      {cid && (
        <Box className="rounded-lg border border-green-500/40 bg-green-900/30 p-4 text-sm text-green-100">
          <p>
            Artifact CID <strong>{cid}</strong> prepared. Confirm mint transaction via orchestrator console to finalize.
          </p>
        </Box>
      )}
    </Stack>
  );
}
