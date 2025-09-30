{{- define "paymaster-supervisor.fullname" -}}
{{- printf "%s-%s" .Release.Name "paymaster-supervisor" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "paymaster-supervisor.labels" -}}
helm.sh/chart: {{ include "paymaster-supervisor.chart" . }}
app.kubernetes.io/name: paymaster-supervisor
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end -}}

{{- define "paymaster-supervisor.selectorLabels" -}}
app.kubernetes.io/name: paymaster-supervisor
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "paymaster-supervisor.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" -}}
{{- end -}}

{{- define "paymaster-supervisor.image" -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository .Values.image.tag -}}
{{- end -}}
{{- end -}}
