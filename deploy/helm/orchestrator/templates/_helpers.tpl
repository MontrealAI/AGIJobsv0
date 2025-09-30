{{- define "orchestrator.fullname" -}}
{{- printf "%s-%s" .Release.Name "orchestrator" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "orchestrator.labels" -}}
helm.sh/chart: {{ include "orchestrator.chart" . }}
app.kubernetes.io/name: orchestrator
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end -}}

{{- define "orchestrator.selectorLabels" -}}
app.kubernetes.io/name: orchestrator
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "orchestrator.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" -}}
{{- end -}}

{{- define "orchestrator.image" -}}
{{- $image := printf "%s:%s" .Values.image.repository .Values.image.tag -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- else -}}
{{- $image -}}
{{- end -}}
{{- end -}}
