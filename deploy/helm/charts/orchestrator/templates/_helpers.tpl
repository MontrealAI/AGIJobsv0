{{- define "orchestrator.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{ .Values.fullnameOverride }}
{{- else -}}
{{- printf "%s-%s" .Release.Name "orchestrator" | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
