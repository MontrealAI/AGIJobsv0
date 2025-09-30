{{- define "graph-node.fullname" -}}
{{- printf "%s-%s" .Release.Name "graph-node" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "graph-node.labels" -}}
helm.sh/chart: {{ include "graph-node.chart" . }}
app.kubernetes.io/name: graph-node
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end -}}

{{- define "graph-node.selectorLabels" -}}
app.kubernetes.io/name: graph-node
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "graph-node.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" -}}
{{- end -}}

{{- define "graph-node.image" -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository .Values.image.tag -}}
{{- end -}}
{{- end -}}

{{- define "graph-node.postgresFullname" -}}
{{- printf "%s-%s" .Release.Name "postgres" | trunc 63 | trimSuffix "-" -}}
{{- end -}}
