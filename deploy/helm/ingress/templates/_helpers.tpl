{{- define "ingress.fullname" -}}
{{- printf "%s-%s" .Release.Name "ingress" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "ingress.labels" -}}
helm.sh/chart: {{ include "ingress.chart" . }}
app.kubernetes.io/name: ingress
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end -}}

{{- define "ingress.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" -}}
{{- end -}}
