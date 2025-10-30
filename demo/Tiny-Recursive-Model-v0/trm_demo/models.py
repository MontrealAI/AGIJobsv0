"""Neural network components implementing the Tiny Recursive Model."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

import torch
from torch import Tensor, nn


class InnerUpdate(nn.Module):
    """Inner recurrence block supporting attention or MLP updates."""

    def __init__(self, latent_dim: int, model_type: str, dropout: float) -> None:
        super().__init__()
        self.model_type = model_type
        self.dropout = nn.Dropout(dropout)
        if model_type == "att":
            self.query = nn.Linear(latent_dim, latent_dim)
            self.key = nn.Linear(latent_dim, latent_dim)
            self.value = nn.Linear(latent_dim, latent_dim)
            self.attn = nn.MultiheadAttention(latent_dim, num_heads=4, batch_first=True)
            self.out = nn.Linear(latent_dim, latent_dim)
        else:
            self.mlp = nn.Sequential(
                nn.Linear(latent_dim * 2, latent_dim),
                nn.SiLU(),
                nn.Linear(latent_dim, latent_dim),
            )
        self.norm = nn.LayerNorm(latent_dim)

    def forward(self, z: Tensor, step_embedding: Tensor) -> Tensor:
        if self.model_type == "att":
            q = self.query(z).unsqueeze(1)
            k = self.key(step_embedding).unsqueeze(1)
            v = self.value(step_embedding).unsqueeze(1)
            attn_out, _ = self.attn(q, k, v, need_weights=False)
            update = self.out(attn_out.squeeze(1))
        else:
            update = self.mlp(torch.cat([z, step_embedding], dim=-1))
        return self.norm(z + self.dropout(update))


class TinyRecursiveModel(nn.Module):
    """Tiny Recursive Model implementing nested reasoning steps."""

    def __init__(
        self,
        *,
        input_dim: int,
        latent_dim: int,
        answer_dim: int,
        model_type: str = "att",
        dropout: float = 0.0,
        weight_init_scale: float = 1.0,
    ) -> None:
        super().__init__()
        self.latent_dim = latent_dim
        self.input_dim = input_dim
        self.answer_dim = answer_dim
        self.model_type = model_type

        self.start_encoder = nn.Linear(1, latent_dim)
        self.step_encoder = nn.Linear(input_dim, latent_dim)
        self.initial_norm = nn.LayerNorm(latent_dim)
        self.inner_update = InnerUpdate(latent_dim, model_type, dropout)
        self.outer_update = nn.Sequential(
            nn.Linear(latent_dim, latent_dim),
            nn.SiLU(),
            nn.Linear(latent_dim, latent_dim),
        )
        self.outer_norm = nn.LayerNorm(latent_dim)
        self.answer_head = nn.Sequential(
            nn.LayerNorm(latent_dim),
            nn.Linear(latent_dim, answer_dim),
        )
        self.halt_head = nn.Sequential(
            nn.LayerNorm(latent_dim),
            nn.Linear(latent_dim, 1),
        )
        self.dropout = nn.Dropout(dropout)
        self._init_weights(weight_init_scale)

    def _init_weights(self, scale: float) -> None:
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight, gain=scale)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)

    def forward(
        self,
        *,
        start: Tensor,
        steps: Tensor,
        lengths: Tensor,
        max_outer_steps: int,
        max_inner_steps: int,
    ) -> Dict[str, Tensor]:
        batch = start.shape[0]
        device = start.device
        lengths = lengths.to(device)
        steps = steps.to(device)
        start = start.to(device)

        steps_emb = self.step_encoder(steps)
        mask = (
            torch.arange(steps.shape[1], device=device)
            .unsqueeze(0)
            .repeat(batch, 1)
        ) < lengths.unsqueeze(1)
        context = torch.where(mask.unsqueeze(-1), steps_emb, torch.zeros_like(steps_emb))
        summed = context.sum(dim=1)
        denom = torch.clamp(lengths.unsqueeze(-1).float(), min=1.0)
        context_mean = summed / denom

        z = self.initial_norm(self.start_encoder(start) + context_mean)

        logits: List[Tensor] = []
        halt_logits: List[Tensor] = []
        latents: List[Tensor] = []
        for _ in range(max_outer_steps):
            for inner in range(max_inner_steps):
                step_index = torch.where(
                    torch.full_like(lengths, inner) < lengths,
                    torch.full_like(lengths, inner),
                    torch.clamp(lengths - 1, min=0),
                )
                batch_indices = torch.arange(batch, device=device)
                selected = steps_emb[batch_indices, step_index]
                z = self.inner_update(z, selected)
                latents.append(z)
            z = self.outer_norm(z + self.dropout(self.outer_update(z)))
            logits.append(self.answer_head(z))
            halt_logits.append(self.halt_head(z).squeeze(-1))
        return {
            "logits": torch.stack(logits, dim=1),
            "halt_logits": torch.stack(halt_logits, dim=1),
            "latents": torch.stack(latents, dim=1),
        }


__all__ = ["TinyRecursiveModel"]
