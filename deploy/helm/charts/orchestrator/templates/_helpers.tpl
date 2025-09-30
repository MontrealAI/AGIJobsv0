{{- define "orchestrator.fullname" -}}
{{- printf "%s-%s" .Release.Name "orchestrator" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "orchestrator.labels" -}}
app.kubernetes.io/name: orchestrator
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: orchestrator
app.kubernetes.io/managed-by: Helm
{{- end -}}
