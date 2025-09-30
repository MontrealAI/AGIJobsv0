{{- define "attester.fullname" -}}
{{- printf "%s-%s" .Release.Name "attester" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "attester.labels" -}}
helm.sh/chart: {{ include "attester.chart" . }}
app.kubernetes.io/name: attester
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end -}}

{{- define "attester.selectorLabels" -}}
app.kubernetes.io/name: attester
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "attester.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" -}}
{{- end -}}

{{- define "attester.image" -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository .Values.image.tag -}}
{{- end -}}
{{- end -}}
