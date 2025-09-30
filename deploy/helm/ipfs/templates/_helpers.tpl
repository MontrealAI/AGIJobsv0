{{- define "ipfs.fullname" -}}
{{- printf "%s-%s" .Release.Name "ipfs" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "ipfs.labels" -}}
helm.sh/chart: {{ include "ipfs.chart" . }}
app.kubernetes.io/name: ipfs
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end -}}

{{- define "ipfs.selectorLabels" -}}
app.kubernetes.io/name: ipfs
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "ipfs.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" -}}
{{- end -}}

{{- define "ipfs.image" -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository .Values.image.tag -}}
{{- end -}}
{{- end -}}
