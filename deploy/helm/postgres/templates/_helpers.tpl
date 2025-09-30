{{- define "postgres.fullname" -}}
{{- printf "%s-%s" .Release.Name "postgres" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "postgres.labels" -}}
helm.sh/chart: {{ include "postgres.chart" . }}
app.kubernetes.io/name: postgres
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end -}}

{{- define "postgres.selectorLabels" -}}
app.kubernetes.io/name: postgres
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "postgres.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" -}}
{{- end -}}

{{- define "postgres.image" -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository .Values.image.tag -}}
{{- end -}}
{{- end -}}
