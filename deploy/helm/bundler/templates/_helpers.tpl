{{- define "bundler.fullname" -}}
{{- printf "%s-%s" .Release.Name "bundler" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "bundler.labels" -}}
helm.sh/chart: {{ include "bundler.chart" . }}
app.kubernetes.io/name: bundler
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end -}}

{{- define "bundler.selectorLabels" -}}
app.kubernetes.io/name: bundler
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "bundler.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" -}}
{{- end -}}

{{- define "bundler.image" -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository .Values.image.tag -}}
{{- end -}}
{{- end -}}
