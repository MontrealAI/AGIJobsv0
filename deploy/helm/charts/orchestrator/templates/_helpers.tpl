{{- define "orchestrator.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "orchestrator.image" -}}
{{- $registry := default "" .Values.global.imageRegistry -}}
{{- if $registry -}}
{{- printf "%s/%s:%s" $registry .Values.image.repository .Values.image.tag -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository .Values.image.tag -}}
{{- end -}}
{{- end -}}

{{- define "orchestrator.imageWithDigest" -}}
{{- $image := include "orchestrator.image" . -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" $image .Values.image.digest -}}
{{- else -}}
{{- $image -}}
{{- end -}}
{{- end -}}

{{- define "orchestrator.serviceAccountName" -}}
{{- default (include "orchestrator.fullname" .) .Values.serviceAccountName -}}
{{- end -}}
